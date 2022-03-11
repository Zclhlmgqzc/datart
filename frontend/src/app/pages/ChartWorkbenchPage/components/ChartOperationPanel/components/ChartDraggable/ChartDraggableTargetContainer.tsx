/**
 * Datart
 *
 * Copyright 2021
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  BgColorsOutlined,
  DiffOutlined,
  DownOutlined,
  FilterOutlined,
  FontSizeOutlined,
  FormatPainterOutlined,
  GroupOutlined,
  SortAscendingOutlined,
} from '@ant-design/icons';
import { Dropdown } from 'antd';
import useFieldActionModal from 'app/hooks/useFieldActionModal';
import ChartAggregationContext from 'app/pages/ChartWorkbenchPage/contexts/ChartAggregationContext';
import ChartDatasetContext from 'app/pages/ChartWorkbenchPage/contexts/ChartDatasetContext';
import VizDataViewContext from 'app/pages/ChartWorkbenchPage/contexts/ChartDataViewContext';
import {
  AggregateFieldSubAggregateType,
  ChartDataSectionField,
  ChartDataSectionFieldActionType,
  ChartDataSectionType,
} from 'app/types/ChartConfig';
import { ChartDataConfigSectionProps } from 'app/types/ChartDataConfigSection';
import { ChartDataViewFieldCategory } from 'app/types/ChartDataView';
import { getColumnRenderName } from 'app/utils/chartHelper';
import { reachLowerBoundCount } from 'app/utils/internalChartHelper';
import { updateBy, updateByKey } from 'app/utils/mutation';
import { CHART_DRAG_ELEMENT_TYPE } from 'globalConstants';
import { rgba } from 'polished';
import { FC, memo, useContext, useEffect, useState } from 'react';
import { DropTargetMonitor, useDrop } from 'react-dnd';
import styled from 'styled-components/macro';
import {
  BORDER_RADIUS,
  LINE_HEIGHT_HEADING,
  SPACE_SM,
} from 'styles/StyleConstants';
import { ValueOf } from 'types';
import { uuidv4 } from 'utils/utils';
import ChartDataConfigSectionActionMenu from './ChartDataConfigSectionActionMenu';
import ChartDraggableElement from './ChartDraggableElement';

type DragItem = {
  index?: number;
};

interface ChartDraggableTargetContainerProps
  extends ChartDataConfigSectionProps {
  canDraggableItemMove?: (
    rows: ChartDataSectionField[],
    dragIndex: number,
    hoverIndex: number,
  ) => boolean;
}

export const ChartDraggableTargetContainer: FC<ChartDraggableTargetContainerProps> =
  memo(function ChartDraggableTargetContainer({
    ancestors,
    modalSize,
    config,
    translate: t = (...args) => args?.[0],
    canDraggableItemMove,
    onConfigChanged,
  }) {
    const { dataset } = useContext(ChartDatasetContext);
    const { dataView } = useContext(VizDataViewContext);
    const [currentConfig, setCurrentConfig] = useState(config);
    const [showModal, contextHolder] = useFieldActionModal({
      i18nPrefix: 'viz.palette.data.enum.actionType',
    });
    const { aggregation } = useContext(ChartAggregationContext);

    const [{ isOver, canDrop }, drop] = useDrop(
      () => ({
        accept: [
          CHART_DRAG_ELEMENT_TYPE.DATASET_COLUMN,
          CHART_DRAG_ELEMENT_TYPE.DATA_CONFIG_COLUMN,
        ],
        drop(item: ChartDataSectionField & DragItem, monitor) {
          let items: ChartDataSectionField[] = Array.isArray(item)
            ? item
            : [item];
          let needDelete = true;
          if (
            monitor.getItemType() === CHART_DRAG_ELEMENT_TYPE.DATASET_COLUMN
          ) {
            const currentColumns: ChartDataSectionField[] = (
              currentConfig.rows || []
            ).concat(items.map(val => getConfigColumn(val, uuidv4())));
            updateCurrentConfigColumns(currentConfig, currentColumns, true);
          } else if (
            monitor.getItemType() === CHART_DRAG_ELEMENT_TYPE.DATA_CONFIG_COLUMN
          ) {
            const originItemIndex = (currentConfig.rows || []).findIndex(
              r => r.uid === item.uid,
            );
            if (originItemIndex > -1) {
              needDelete = false;
              const currentColumns = updateBy(
                currentConfig?.rows || [],
                draft => {
                  draft.splice(originItemIndex, 1);
                  return draft.splice(item?.index!, 0, getConfigColumn(item));
                },
              );
              updateCurrentConfigColumns(currentConfig, currentColumns);
            } else {
              const currentColumns = updateBy(
                currentConfig?.rows || [],
                draft => {
                  return draft.splice(item?.index!, 0, getConfigColumn(item));
                },
              );
              updateCurrentConfigColumns(currentConfig, currentColumns);
            }
          }

          return { delete: needDelete };
        },
        canDrop: (item: ChartDataSectionField, monitor) => {
          let items = Array.isArray(item) ? item : [item];

          if (
            typeof currentConfig.actions === 'object' &&
            !items.every(val => val.type in (currentConfig.actions || {}))
          ) {
            //zh: 判断现在拖动的数据项是否可以拖动到当前容器中 en: Determine whether the currently dragged data item can be dragged into the current container
            return false;
          }

          // if (
          //   typeof currentConfig.actions === 'object' &&
          //   !(item.type in currentConfig.actions)
          // ) {
          //   return false;
          // }

          if (currentConfig.allowSameField) {
            return true;
          }

          if (
            monitor.getItemType() === CHART_DRAG_ELEMENT_TYPE.DATA_CONFIG_COLUMN
          ) {
            return true;
          }
          const exists = currentConfig.rows?.map(col => col.colName);
          return items.every(i => !exists?.includes(i.colName));
        },
        collect: (monitor: DropTargetMonitor) => ({
          isOver: monitor.isOver(),
          canDrop: monitor.canDrop(),
        }),
      }),
      [onConfigChanged, currentConfig, dataView, dataset],
    );

    useEffect(() => {
      setCurrentConfig(config);
    }, [config]);

    const updateCurrentConfigColumns = (
      currentConfig,
      newColumns,
      refreshDataset = false,
    ) => {
      const newCurrentConfig = updateByKey(currentConfig, 'rows', newColumns);
      setCurrentConfig(newCurrentConfig);
      onConfigChanged?.(ancestors, newCurrentConfig, refreshDataset);
    };

    const getDefaultAggregate = item => {
      if (
        currentConfig?.type === ChartDataSectionType.AGGREGATE ||
        currentConfig?.type === ChartDataSectionType.SIZE ||
        currentConfig?.type === ChartDataSectionType.INFO ||
        currentConfig?.type === ChartDataSectionType.MIXED
      ) {
        if (currentConfig.disableAggregate) {
          return;
        }
        if (
          item.category ===
          (ChartDataViewFieldCategory.AggregateComputedField as string)
        ) {
          return;
        }

        let aggType: string = '';
        if (currentConfig?.actions instanceof Array) {
          currentConfig?.actions?.find(
            type =>
              type === ChartDataSectionFieldActionType.Aggregate ||
              type === ChartDataSectionFieldActionType.AggregateLimit,
          );
        } else if (currentConfig?.actions instanceof Object) {
          aggType = currentConfig?.actions?.[item?.type]?.find(
            type =>
              type === ChartDataSectionFieldActionType.Aggregate ||
              type === ChartDataSectionFieldActionType.AggregateLimit,
          );
        }
        if (aggType) {
          return AggregateFieldSubAggregateType?.[aggType]?.[0];
        }
      }
    };

    const getConfigColumn = (val: ChartDataSectionField, uid?: string) => {
      return {
        uid: uid || val.uid,
        colName: val.colName,
        category: val.category,
        type: val.type,
        aggregate: getDefaultAggregate(val),
      };
    };

    const handleDraggableItemMove = (dragIndex: number, hoverIndex: number) => {
      const rows = currentConfig.rows;
      if (!rows) {
        return false;
      }
      if (
        canDraggableItemMove &&
        !canDraggableItemMove(rows, dragIndex, hoverIndex)
      ) {
        return false;
      }
      const draggedItem = rows[dragIndex];
      if (draggedItem) {
        const newCurrentConfig = updateBy(currentConfig, draft => {
          const columns = draft.rows || [];
          columns.splice(dragIndex, 1);
          columns.splice(hoverIndex, 0, draggedItem);
        });
        setCurrentConfig(newCurrentConfig);
        return true;
      } else {
        // const placeholder = {
        //   uid: CHARTCONFIG_FIELD_PLACEHOLDER_UID,
        //   colName: 'Placeholder',
        //   category: 'field',
        //   type: 'STRING',
        // } as any;
        // const newCurrentConfig = updateBy(currentConfig, draft => {
        //   const columns = draft.rows || [];
        //   if (dragIndex) {
        //     columns.splice(dragIndex, 1);
        //   }
        //   columns.splice(hoverIndex, 0, placeholder);
        // });
        // setCurrentConfig(newCurrentConfig);
      }
      return false;
    };

    const handleOnDeleteItem = uid => () => {
      if (uid) {
        const newCurrentConfig = updateBy(currentConfig, draft => {
          draft.rows = draft.rows?.filter(c => c.uid !== uid);
        });
        setCurrentConfig(newCurrentConfig);
        onConfigChanged?.(ancestors, newCurrentConfig, true);
      }
    };

    const renderDropItems = () => {
      if (
        !currentConfig.rows ||
        !currentConfig?.rows?.filter(Boolean)?.length
      ) {
        const fieldCount = reachLowerBoundCount(currentConfig?.limit, 0);
        if (fieldCount > 0) {
          return (
            <DropPlaceholder>
              {t('dropCount', undefined, { count: fieldCount })}
            </DropPlaceholder>
          );
        }
        return <DropPlaceholder>{t('drop')}</DropPlaceholder>;
      }
      return currentConfig.rows?.map((columnConfig, index) => {
        return (
          <ChartDraggableElement
            key={columnConfig.uid}
            id={columnConfig.uid}
            index={index}
            config={columnConfig}
            content={() => {
              return (
                <Dropdown
                  key={columnConfig.uid}
                  disabled={!config?.actions}
                  destroyPopupOnHide={true}
                  overlay={renderActionExtensionMenu(
                    columnConfig.uid!,
                    columnConfig.type,
                    columnConfig.category,
                  )}
                  overlayClassName="datart-data-section-dropdown"
                  trigger={['click']}
                >
                  <div>
                    {currentConfig?.actions && (
                      <DownOutlined style={{ marginRight: '10px' }} />
                    )}
                    <span>
                      {aggregation === false
                        ? columnConfig.colName
                        : getColumnRenderName(columnConfig)}
                    </span>
                    <div style={{ display: 'inline-block', marginLeft: '5px' }}>
                      {enableActionsIcons(columnConfig)}
                    </div>
                  </div>
                </Dropdown>
              );
            }}
            moveCard={handleDraggableItemMove}
            onDelete={handleOnDeleteItem(columnConfig.uid)}
          ></ChartDraggableElement>
        );
      });
    };

    const handleFieldConfigChanged = (
      columnUid: string,
      fieldConfig: ChartDataSectionField,
      needRefresh?: boolean,
    ) => {
      if (!fieldConfig) {
        return;
      }
      const newConfig = updateBy(config, draft => {
        const index = (draft.rows || []).findIndex(r => r.uid === columnUid);
        if (index !== -1 && fieldConfig) {
          (draft.rows || [])[index] = fieldConfig;
        }
      });
      onConfigChanged?.(ancestors, newConfig, needRefresh);
    };

    const handleOpenActionModal =
      (uid: string) =>
      (actionType: ValueOf<typeof ChartDataSectionFieldActionType>) => {
        (showModal as Function)(
          uid,
          actionType,
          config,
          handleFieldConfigChanged,
          dataset,
          dataView,
          modalSize,
          aggregation,
        );
      };

    const renderActionExtensionMenu = (uid: string, type: string, category) => {
      return (
        <ChartDataConfigSectionActionMenu
          uid={uid}
          type={type}
          category={category}
          ancestors={ancestors}
          config={currentConfig}
          modalSize={modalSize}
          onConfigChanged={onConfigChanged}
          onOpenModal={handleOpenActionModal}
        />
      );
    };

    const enableActionsIcons = col => {
      const icons = [] as any;
      if (col.alias) {
        icons.push(<DiffOutlined key="alias" />);
      }
      if (col.sort) {
        icons.push(<SortAscendingOutlined key="sort" />);
      }
      if (col.format) {
        icons.push(<FormatPainterOutlined key="format" />);
      }
      if (col.aggregate) {
        icons.push(<GroupOutlined key="aggregate" />);
      }
      if (col.filter) {
        icons.push(<FilterOutlined key="filter" />);
      }
      if (col.color) {
        icons.push(<BgColorsOutlined key="color" />);
      }
      if (col.size) {
        icons.push(<FontSizeOutlined key="size" />);
      }
      return icons;
    };

    return (
      <StyledContainer ref={drop} isOver={isOver} canDrop={canDrop}>
        {renderDropItems()}
        {contextHolder}
      </StyledContainer>
    );
  });

export default ChartDraggableTargetContainer;

const StyledContainer = styled.div<{
  isOver: boolean;
  canDrop: boolean;
}>`
  padding: ${SPACE_SM};
  color: ${p => p.theme.textColorLight};
  text-align: center;
  background-color: ${props =>
    props.canDrop
      ? rgba(props.theme.success, 0.25)
      : props.isOver
      ? rgba(props.theme.error, 0.25)
      : props.theme.emphasisBackground};
  border-radius: ${BORDER_RADIUS};

  .draggable-element:last-child {
    margin-bottom: 0;
  }
`;

const DropPlaceholder = styled.p`
  line-height: ${LINE_HEIGHT_HEADING};
`;
