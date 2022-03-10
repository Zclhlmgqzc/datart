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

import echartsDefaultTheme from 'app/assets/theme/echarts_default_theme.json';
import {
  ChartDataSet,
  ChartDataSetRow,
} from 'app/components/ChartGraph/models/ChartDataSet';
import {
  ChartConfig,
  ChartDataConfig,
  ChartDataSectionField,
  ChartDataSectionType,
  ChartStyleConfig,
  FieldFormatType,
  IFieldFormatConfig,
  RowValue,
  SortActionType,
} from 'app/types/ChartConfig';
import {
  ChartCommonConfig,
  ChartStyleConfigDTO,
} from 'app/types/ChartConfigDTO';
import {
  ChartDatasetMeta,
  IChartDataSet,
  IChartDataSetRow,
} from 'app/types/ChartDataSet';
import ChartMetadata from 'app/types/ChartMetadata';
import { ECharts } from 'echarts';
import { ECBasicOption } from 'echarts/types/dist/shared';
import { NumberUnitKey, NumericUnitDescriptions } from 'globalConstants';
import moment from 'moment';
import { Debugger } from 'utils/debugger';
import { isEmpty, isEmptyArray, meanValue, pipe } from 'utils/object';
import {
  flattenHeaderRowsWithoutGroupRow,
  getAxisLengthByConfig,
  getColumnRenderOriginName,
  getRequiredAggregatedSections,
  getRequiredGroupedSections,
  isInRange,
} from './internalChartHelper';

/**
 * [中文] 获取格式聚合数据
 * </br>
 * [EN] Gets format aggregate data
 *
 * @example
 * const format = {
 *   percentage: {
 *     decimalPlaces: 2,
 *   },
 *   type: "percentage",
 * }
 * const formattedData = toFormattedValue('1', format);
 * console.log(formattedData); // '100.00%';
 * @export
 * @param {(number | string)} [value]
 * @param {IFieldFormatConfig} [format]
 * @return {*}
 */
export function toFormattedValue(
  value?: number | string,
  format?: IFieldFormatConfig,
) {
  if (value === null || value === undefined) {
    return '-';
  }

  if (!format || format.type === FieldFormatType.DEFAULT) {
    return value;
  }

  if (!format.type) {
    return value;
  }

  const { type: formatType } = format;

  if (
    typeof value === 'string' &&
    formatType !== FieldFormatType.DATE &&
    (!value || isNaN(+value))
  ) {
    return value;
  }

  const config = format[formatType];
  if (!config) {
    return value;
  }

  let formattedValue;
  switch (formatType) {
    case FieldFormatType.NUMERIC:
      const numericConfig =
        config as IFieldFormatConfig[FieldFormatType.NUMERIC];
      formattedValue = pipe(
        unitFormater,
        decimalPlacesFormater,
        numericFormater,
      )(value, numericConfig);
      break;
    case FieldFormatType.CURRENCY:
      const currencyConfig =
        config as IFieldFormatConfig[FieldFormatType.CURRENCY];
      formattedValue = pipe(currencyFormater)(value, currencyConfig);
      break;
    case FieldFormatType.PERCENTAGE:
      const percentageConfig =
        config as IFieldFormatConfig[FieldFormatType.PERCENTAGE];
      formattedValue = pipe(percentageFormater)(value, percentageConfig);
      break;
    case FieldFormatType.SCIENTIFIC:
      const scientificNotationConfig =
        config as IFieldFormatConfig[FieldFormatType.SCIENTIFIC];
      formattedValue = pipe(scientificNotationFormater)(
        value,
        scientificNotationConfig,
      );
      break;
    case FieldFormatType.DATE:
      const dateConfig = config as IFieldFormatConfig[FieldFormatType.DATE];
      formattedValue = pipe(dateFormater)(value, dateConfig);
      break;
    default:
      formattedValue = value;
      break;
  }

  return formattedValue;
}

function decimalPlacesFormater(
  value,
  config?:
    | IFieldFormatConfig[FieldFormatType.NUMERIC]
    | IFieldFormatConfig[FieldFormatType.CURRENCY],
) {
  if (isEmpty(config?.decimalPlaces)) {
    return value;
  }
  if (isNaN(value)) {
    return value;
  }
  if (config?.decimalPlaces! < 0 || config?.decimalPlaces! > 100) {
    return value;
  }

  return (+value).toFixed(config?.decimalPlaces);
}

function unitFormater(
  value: any,
  config?:
    | IFieldFormatConfig[FieldFormatType.NUMERIC]
    | IFieldFormatConfig[FieldFormatType.CURRENCY],
) {
  if (isEmpty(config?.unitKey)) {
    return value;
  }

  if (isNaN(+value)) {
    return value;
  }
  const realUnit = NumericUnitDescriptions.get(config?.unitKey!)?.[0] || 1;
  return +value / realUnit;
}

function numericFormater(
  value,
  config?: IFieldFormatConfig[FieldFormatType.NUMERIC],
) {
  if (isNaN(+value)) {
    return value;
  }

  const valueWithPrefixs = [
    config?.prefix || '',
    thousandSeperatorFormater(value, config),
    NumericUnitDescriptions.get(config?.unitKey || NumberUnitKey.None)?.[1],
    config?.suffix || '',
  ].join('');
  return valueWithPrefixs;
}

function thousandSeperatorFormater(
  value,
  config?: IFieldFormatConfig[FieldFormatType.NUMERIC],
) {
  if (isNaN(+value) || !config?.useThousandSeparator) {
    return value;
  }

  const parts = value.toString().split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const formatted = parts.join('.');
  return formatted;
}

function currencyFormater(
  value,
  config?: IFieldFormatConfig[FieldFormatType.CURRENCY],
) {
  if (isNaN(+value)) {
    return value;
  }

  const realUnit = NumericUnitDescriptions.get(config?.unitKey!)?.[0] || 1;

  return `${new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: config?.currency || 'CNY',
    minimumFractionDigits: config?.decimalPlaces,
    useGrouping: config?.useThousandSeparator,
  }).format(value / realUnit)} ${
    NumericUnitDescriptions.get(config?.unitKey || NumberUnitKey.None)?.[1]
  }`;
}

function percentageFormater(
  value,
  config?: IFieldFormatConfig[FieldFormatType.PERCENTAGE],
) {
  if (isNaN(+value)) {
    return value;
  }

  let fractionDigits = 0;
  if (
    !isEmpty(config?.decimalPlaces) &&
    +config?.decimalPlaces! >= 0 &&
    +config?.decimalPlaces! <= 20
  ) {
    fractionDigits = +config?.decimalPlaces!;
  }
  return `${(+value * 100).toFixed(fractionDigits)}%`;
}

function scientificNotationFormater(
  value,
  config?: IFieldFormatConfig[FieldFormatType.SCIENTIFIC],
) {
  if (isNaN(+value)) {
    return value;
  }
  let fractionDigits = 0;
  if (
    !isEmpty(config?.decimalPlaces) &&
    +config?.decimalPlaces! >= 0 &&
    +config?.decimalPlaces! <= 20
  ) {
    fractionDigits = +config?.decimalPlaces!;
  }
  return (+value).toExponential(fractionDigits);
}

function dateFormater(
  value,
  config?: IFieldFormatConfig[FieldFormatType.DATE],
) {
  if (isNaN(+value) || isEmpty(config?.format)) {
    return value;
  }

  return moment(value).format(config?.format);
}

/**
 * [中文] 获取系统默认颜色
 * </br>
 * [EN] Gets an array of default colors
 *
 * @example
 * const colorList = getDefaultThemeColor();
 * console.log(colorList); // ["#298ffe","#dae9ff","#fe705a","#ffdcdc","#751adb","#8663d7","#15AD31","#FAD414","#E62412"]
 *
 * @export
 * @return {*} default color array
 */
export function getDefaultThemeColor() {
  return echartsDefaultTheme.color;
}

/**
 * [中文] 使用路径语法获取配置信息，此方法已过时，请参考方法getStyles
 * </br>
 * [EN] Get config info by value path, please use getStyles instread
 *
 * @deprecated This function will be removed in next versiion, please use @see {@link getStyles} instread
 * @param {ChartStyleConfig[]} styleConfigs
 * @param {string[]} paths
 * @return {*}  {*}
 */
export function getStyleValue(
  styleConfigs: ChartStyleConfig[],
  paths: string[],
): any {
  return getValue(styleConfigs, paths);
}

/**
 * [中文] 使用路径语法获取配置信息，此方法已过时，请参考方法getStyles
 * </br>
 * [EN] Get setting config info by value path, please use getStyles instread
 *
 * @deprecated This function will be removed in next versiion, please use @see {@link getStyles} instread
 * @export
 * @param {ChartStyleConfig[]} configs
 * @param {string} path
 * @param {string} targetKey
 * @return {*}
 */
export function getSettingValue(
  configs: ChartStyleConfig[],
  path: string,
  targetKey: string,
) {
  return getValue(configs, path.split('.'), targetKey);
}

/**
 * [中文] 使用路径语法获取配置信息，此方法已过时，请参考方法getStyles
 * </br>
 * [EN] Get setting config info by value path, please use getStyles instread
 *
 * @deprecated This function will be removed in next versiion, please use @see {@link getStyles} instread
 * @export
 * @param {ChartStyleConfig[]} styles
 * @param {string} groupPath
 * @param {string} childPath
 * @return {*}
 */
export function getStyleValueByGroup(
  styles: ChartStyleConfig[],
  groupPath: string,
  childPath: string,
) {
  const childPaths = childPath.split('.');
  return getValue(styles, [groupPath, ...childPaths]);
}

/**
 * [中文] 通过数组路径语法，获取对应的配置的值集合
 * </br>
 * [EN] Get config style values
 *
 * @example
 *
 * const styleConfigs = [
 *       {
 *        key: 'label',
 *        rows: [
 *           { key: 'color', value: 'red' },
 *           { key: 'font', value: 'sans-serif' },
 *         ],
 *       },
 *     ];
 * const [color, font] = getStyles(styleConfigs, ['label'], ['color', 'font']);
 * console.log(color); // red
 * console.log(font); // sans-serif
 *
 * @param {Array<ChartStyleConfig>} configs required
 * @param {Array<string>} parentKeyPaths required
 * @param {Array<string>} childTargetKeys required
 * @return {*} array of child keys with the same order
 */
export function getStyles(
  configs: Array<ChartStyleConfig>,
  parentKeyPaths: Array<string>,
  childTargetKeys: Array<string>,
) {
  const rows = getValue(configs, parentKeyPaths, 'rows');
  if (!rows) {
    return Array(childTargetKeys.length).fill(undefined);
  }
  return childTargetKeys.map(k => getValue(rows, [k]));
}

/**
 * [中文] 通过数组路径语法，获取对应的配置信息
 * </br>
 * [EN] Get style config value base funtion with default target key
 *
 * @example
 *
 * const styleConfigs = [
 *       {
 *        key: 'label',
 *        rows: [
 *           { key: 'color', value: 'red' },
 *           { key: 'font', value: 'sans-serif' },
 *         ],
 *       },
 *     ];
 * const colorValue = getValue(styleConfigs, ['label', 'color']);
 * console.log(colorValue); // red
 *
 * @param {Array<ChartStyleConfig>} configs
 * @param {Array<string>} keyPaths
 * @param {string} [targetKey='value']
 * @return {*}
 */
export function getValue(
  configs: Array<ChartStyleConfig | ChartStyleConfigDTO>,
  keyPaths: Array<string>,
  targetKey = 'value',
) {
  let iterators = configs || [];
  while (!isEmptyArray(iterators)) {
    const key = keyPaths?.shift();
    const group = iterators?.find(sc => sc.key === key);
    if (!group) {
      return undefined;
    }
    if (isEmptyArray(keyPaths)) {
      return group[targetKey];
    }
    iterators = group.rows || [];
  }
}

export function getCustomSortableColumns(columns, dataConfigs) {
  const sortConfigs = dataConfigs
    .filter(
      c =>
        c.type === ChartDataSectionType.AGGREGATE ||
        c.type === ChartDataSectionType.GROUP,
    )
    .flatMap(config => config.rows || []);

  if (!sortConfigs || sortConfigs.length === 0) {
    return columns;
  }
  const sortConfig = sortConfigs[0];
  if (!sortConfig.colName || !sortConfig.sort) {
    return columns;
  }
  const sort = sortConfig.sort;
  if (!sort || sort.type !== SortActionType.CUSTOMIZE) {
    return columns;
  }
  const sortValues = sortConfig.sort.value || [];
  return columns.sort(
    (prev, next) =>
      sortValues.indexOf(prev[sortConfig.colName]) -
      sortValues.indexOf(next[sortConfig.colName]),
  );
}

export function getReference(
  settingConfigs,
  dataColumns,
  dataConfig,
  isHorizonDisplay,
) {
  const referenceTabs = getSettingValue(
    settingConfigs,
    'reference.panel.configuration',
    'rows',
  );

  return {
    markLine: getMarkLine(
      referenceTabs,
      dataColumns,
      dataConfig,
      isHorizonDisplay,
    ),
    markArea: getMarkArea(referenceTabs, dataColumns, isHorizonDisplay),
  };
}

export function getReference2(
  settingConfigs,
  dataSetRows: IChartDataSetRow<string>[],
  dataConfig,
  isHorizonDisplay,
) {
  const referenceTabs = getSettingValue(
    settingConfigs,
    'reference.panel.configuration',
    'rows',
  );

  return {
    markLine: getMarkLine2(
      referenceTabs,
      dataSetRows,
      dataConfig,
      isHorizonDisplay,
    ),
    markArea: getMarkArea2(
      referenceTabs,
      dataSetRows,
      dataConfig,
      isHorizonDisplay,
    ),
  };
}

function getMarkLine(refTabs, dataColumns, dataConfig, isHorizonDisplay) {
  const markLineData = refTabs
    ?.reduce((acc, cur) => {
      const markLineConfigs = cur?.rows?.filter(r => r.key === 'markLine');
      acc.push(...markLineConfigs);
      return acc;
    }, [])
    .map(ml => {
      return getMarkLineData(
        ml,
        dataColumns,
        'valueType',
        'constantValue',
        'metric',
        dataConfig,
        isHorizonDisplay,
      );
    })
    .filter(Boolean);

  return {
    data: markLineData,
  };
}

function getMarkLineData(
  mark,
  dataColumns,
  valueTypeKey,
  constantValueKey,
  metricKey,
  dataConfig,
  isHorizonDisplay,
) {
  const name = mark.label;
  const valueKey = isHorizonDisplay ? 'xAxis' : 'yAxis';
  const show = getSettingValue(mark.rows, 'showLabel', 'value');
  const enableMarkLine = getSettingValue(mark.rows, 'enableMarkLine', 'value');
  const position = getSettingValue(mark.rows, 'position', 'value');
  const font = getSettingValue(mark.rows, 'font', 'value');
  const lineStyle = getSettingValue(mark.rows, 'lineStyle', 'value');
  const valueType = getSettingValue(mark.rows, valueTypeKey, 'value');
  const metricUid = getSettingValue(mark.rows, metricKey, 'value');
  const metr = getValueByColumnKey(dataConfig);

  const metricDatas =
    dataConfig.uid === metricUid ? dataColumns.map(d => +d[metr]) : [];
  const constantValue = getSettingValue(mark.rows, constantValueKey, 'value');
  let yAxis = 0;
  switch (valueType) {
    case 'constant':
      yAxis = constantValue;
      break;
    case 'average':
      yAxis = meanValue(metricDatas);
      break;
    case 'max':
      yAxis = Math.max(...metricDatas);
      break;
    case 'min':
      yAxis = Math.min(...metricDatas);
      break;
  }

  if (!enableMarkLine) {
    return null;
  }

  return {
    [valueKey]: yAxis,
    name,
    label: {
      show,
      position,
      ...font,
    },
    lineStyle,
  };
}

function getMarkLine2(
  refTabs,
  dataSetRows: IChartDataSetRow<string>[],
  dataConfig,
  isHorizonDisplay,
) {
  const markLineData = refTabs
    ?.reduce((acc, cur) => {
      const markLineConfigs = cur?.rows?.filter(r => r.key === 'markLine');
      acc.push(...markLineConfigs);
      return acc;
    }, [])
    .map(ml => {
      return getMarkLineData2(
        ml,
        dataSetRows,
        'valueType',
        'constantValue',
        'metric',
        dataConfig,
        isHorizonDisplay,
      );
    })
    .filter(Boolean);

  return {
    data: markLineData,
  };
}

function getMarkLineData2(
  mark,
  dataSetRows: IChartDataSetRow<string>[],
  valueTypeKey,
  constantValueKey,
  metricKey,
  dataConfig,
  isHorizonDisplay,
) {
  const name = mark.label;
  const valueKey = isHorizonDisplay ? 'xAxis' : 'yAxis';
  const show = getSettingValue(mark.rows, 'showLabel', 'value');
  const enableMarkLine = getSettingValue(mark.rows, 'enableMarkLine', 'value');
  const position = getSettingValue(mark.rows, 'position', 'value');
  const font = getSettingValue(mark.rows, 'font', 'value');
  const lineStyle = getSettingValue(mark.rows, 'lineStyle', 'value');
  const valueType = getSettingValue(mark.rows, valueTypeKey, 'value');
  const metricUid = getSettingValue(mark.rows, metricKey, 'value');

  const metricDatas =
    dataConfig.uid === metricUid
      ? dataSetRows.map(d => +d.getCell(dataConfig))
      : [];
  const constantValue = getSettingValue(mark.rows, constantValueKey, 'value');
  let yAxis = 0;
  switch (valueType) {
    case 'constant':
      yAxis = constantValue;
      break;
    case 'average':
      yAxis = meanValue(metricDatas);
      break;
    case 'max':
      yAxis = Math.max(...metricDatas);
      break;
    case 'min':
      yAxis = Math.min(...metricDatas);
      break;
  }

  if (!enableMarkLine) {
    return null;
  }

  return {
    [valueKey]: yAxis,
    name,
    label: {
      show,
      position,
      ...font,
    },
    lineStyle,
  };
}

function getMarkAreaData2(
  mark,
  dataSetRows: IChartDataSetRow<string>[],
  valueTypeKey,
  constantValueKey,
  metricKey,
  dataConfig,
  isHorizonDisplay,
) {
  const metric = getSettingValue(mark.rows, metricKey, 'value');
  const valueKey = isHorizonDisplay ? 'xAxis' : 'yAxis';
  const show = getSettingValue(mark.rows, 'showLabel', 'value');
  const enableMarkArea = getSettingValue(mark.rows, 'enableMarkArea', 'value');
  const position = getSettingValue(mark.rows, 'position', 'value');
  const font = getSettingValue(mark.rows, 'font', 'value');
  const borderStyle = getSettingValue(mark.rows, 'borderStyle', 'value');
  const opacity = getSettingValue(mark.rows, 'opacity', 'value');
  const backgroundColor = getSettingValue(
    mark.rows,
    'backgroundColor',
    'value',
  );
  const name = mark.value;
  const valueType = getSettingValue(mark.rows, valueTypeKey, 'value');
  const metricDatas =
    dataConfig.uid === metric
      ? dataSetRows.map(d => +d.getCell(dataConfig))
      : [];
  const constantValue = getSettingValue(mark.rows, constantValueKey, 'value');
  let yAxis = 0;
  switch (valueType) {
    case 'constant':
      yAxis = constantValue;
      break;
    case 'average':
      yAxis = meanValue(metricDatas);
      break;
    case 'max':
      yAxis = Math.max(...metricDatas);
      break;
    case 'min':
      yAxis = Math.min(...metricDatas);
      break;
  }

  if (!enableMarkArea || !Number.isFinite(yAxis) || Number.isNaN(yAxis)) {
    return;
  }

  return {
    [valueKey]: yAxis,
    name,
    label: {
      show,
      position,
      ...font,
    },
    itemStyle: {
      opacity,
      color: backgroundColor,
      borderColor: borderStyle.color,
      borderWidth: borderStyle.width,
      borderType: borderStyle.type,
    },
  };
}

function getMarkAreaData(
  mark,
  dataColumns,
  valueTypeKey,
  constantValueKey,
  metricKey,
  isHorizonDisplay,
) {
  const valueKey = isHorizonDisplay ? 'xAxis' : 'yAxis';
  const show = getSettingValue(mark.rows, 'showLabel', 'value');
  const enableMarkArea = getSettingValue(mark.rows, 'enableMarkArea', 'value');
  const position = getSettingValue(mark.rows, 'position', 'value');
  const font = getSettingValue(mark.rows, 'font', 'value');
  const borderStyle = getSettingValue(mark.rows, 'borderStyle', 'value');
  const opacity = getSettingValue(mark.rows, 'opacity', 'value');
  const backgroundColor = getSettingValue(
    mark.rows,
    'backgroundColor',
    'value',
  );
  const name = mark.value;
  const valueType = getSettingValue(mark.rows, valueTypeKey, 'value');
  const metric = getSettingValue(mark.rows, metricKey, 'value');
  const metricDatas = dataColumns.map(d => +d[metric]);
  const constantValue = getSettingValue(mark.rows, constantValueKey, 'value');
  let yAxis = 0;
  switch (valueType) {
    case 'constant':
      yAxis = constantValue;
      break;
    case 'average':
      yAxis = meanValue(metricDatas);
      break;
    case 'max':
      yAxis = Math.max(...metricDatas);
      break;
    case 'min':
      yAxis = Math.min(...metricDatas);
      break;
  }

  if (!enableMarkArea) {
    return null;
  }

  return {
    [valueKey]: yAxis,
    name,
    label: {
      show,
      position,
      ...font,
    },
    itemStyle: {
      opacity,
      color: backgroundColor,
      borderColor: borderStyle.color,
      borderWidth: borderStyle.width,
      borderType: borderStyle.type,
    },
  };
}

function getMarkArea(refTabs, dataColumns, isHorizonDisplay) {
  const refAreas = refTabs?.reduce((acc, cur) => {
    const markLineConfigs = cur?.rows?.filter(r => r.key === 'markArea');
    acc.push(...markLineConfigs);
    return acc;
  }, []);
  return {
    data: refAreas
      ?.map(mark => {
        const markAreaData = ['start', 'end']
          .map(prefix => {
            return getMarkAreaData(
              mark,
              dataColumns,
              `${prefix}ValueType`,
              `${prefix}ConstantValue`,
              `${prefix}Metric`,
              isHorizonDisplay,
            );
          })
          .filter(Boolean);
        return markAreaData;
      })
      .filter(m => Boolean(m?.length)),
  };
}

function getMarkArea2(
  refTabs,
  dataSetRows: IChartDataSetRow<string>[],
  dataConfig,
  isHorizonDisplay,
) {
  const refAreas = refTabs?.reduce((acc, cur) => {
    const markLineConfigs = cur?.rows?.filter(r => r.key === 'markArea');
    return acc.concat(markLineConfigs);
  }, []);
  return {
    data: refAreas
      ?.map(mark => {
        const markAreaData = ['start', 'end']
          .map(prefix => {
            return getMarkAreaData2(
              mark,
              dataSetRows,
              `${prefix}ValueType`,
              `${prefix}ConstantValue`,
              `${prefix}Metric`,
              dataConfig,
              isHorizonDisplay,
            );
          })
          .filter(Boolean);
        return markAreaData;
      })
      .filter(m => m?.length === 2),
  };
}

export function getAxisLine(show, lineStyle) {
  return {
    show,
    lineStyle,
  };
}

export function getAxisLabel(
  show,
  font: { fontFamily; fontSize; color },
  interval = null,
  rotate = null,
  overflow = null,
) {
  return {
    show,
    interval,
    rotate,
    overflow,
    ...font,
  };
}

export function getSplitLine(show, lineStyle) {
  return {
    show,
    lineStyle,
  };
}

export function getAxisTick(show, lineStyle) {
  return {
    show,
    lineStyle,
  };
}

export function getNameTextStyle(fontFamily, fontSize, color) {
  return {
    fontFamily,
    fontSize,
    color,
  };
}

/**
 * [中文] 将服务端返回数据转换为ChartDataSet模型
 * </br>
 * [EN] Create ChartDataSet Model with sorted values
 *
 * @export
 * @template T
 * @param {T[][]} [datas]
 * @param {ChartDatasetMeta[]} [metas]
 * @param {ChartDataConfig[]} [dataConfigs]
 * @return {*}  {IChartDataSet<T>}
 */
export function transformToDataSet<T>(
  datas?: T[][],
  metas?: ChartDatasetMeta[],
  dataConfigs?: ChartDataConfig[],
): IChartDataSet<T> {
  const fields = (dataConfigs || []).flatMap(config => config.rows || []);
  const ds = new ChartDataSet(datas || [], metas || [], fields || []);
  ds.sortBy(dataConfigs || []);
  return ds;
}

/**
 * [中文] 将服务端返回数据转换为一维对象数组结构, 已过时，请使用transformToDataSet
 * </br>
 * [EN] transform dataset to object array, please use transformToDataSet instead
 *
 * @deprecated shoule use DataSet model, @see {@link transformToDataSet}
 * @description
 * Support:
 *  1. Case Insensitive to get value
 *  2. More util helper
 * @example
 *
 * const columns = [
 *      ['r1-c1-v', 'r1-c2-v'],
 *      ['r2-c1-v', 'r2-c2-v'],
 *    ];
 * const metas = [{ name: 'name' }, { name: 'age' }];
 * const datas = transformToObjectArray(columns, metas);
 * console.log(datas); // [{"name":"r1-c1-v","age":"r1-c2-v2"},{"name":"r2-c1-v","age":"r2-c2-v"}]
 *
 * @export
 * @param {string[][]} [columns]
 * @param {ChartDatasetMeta[]} [metas]
 * @return {*}
 */
export function transformToObjectArray(
  columns?: string[][],
  metas?: ChartDatasetMeta[],
) {
  if (!columns || !metas) {
    return [];
  }

  return Debugger.instance.measure(
    'transformToObjectArray',
    () => {
      const result: any[] = Array.apply(null, Array(columns.length));
      for (let j = 0, outerLength = result.length; j < outerLength; j++) {
        let objCol: any = {};
        for (let i = 0, innerLength = metas.length; i < innerLength; i++) {
          const key = metas?.[i]?.name;
          if (!!key) {
            objCol[key] = columns[j][i];
          }
        }
        result[j] = objCol;
      }
      return result;
    },
    false,
  );
}

export function getValueByColumnKey(field?: {
  aggregate?;
  colName: string;
}): string {
  if (!field) {
    return '';
  }
  if (!field.aggregate) {
    return field.colName;
  }
  return `${field.aggregate}(${field.colName})`;
}

/**
 * [中文] 获取字段的图表显示名称
 * </br>
 * [EN] Get data field render name by alias, colName and aggregate
 *
 * @export
 * @param {ChartDataSectionField} [field]
 * @return {string}
 */
export function getColumnRenderName(field?: ChartDataSectionField): string {
  if (!field) {
    return '[unknown]';
  }
  if (field.alias?.name) {
    return field.alias.name;
  }
  return getColumnRenderOriginName(field);
}

export const rowBubbleMove = (
  rows: RowValue[],
  idx: number,
  targetIdx: number,
) => {
  const stepSize = targetIdx > idx ? 1 : -1;
  for (let i = idx; i !== targetIdx; i += stepSize) {
    [rows[i], rows[i + stepSize]] = [rows[i + stepSize], rows[i]];
  }
};

export const findRowBrothers = (uid: string, rows: RowValue[]) => {
  let row = rows.find(r => r.uid === uid);
  if (!!row) {
    return rows;
  }
  let subRows: RowValue[] = [];
  for (let i = 0; i < rows.length; i++) {
    subRows = findRowBrothers(uid, rows[i].children || []);
    if (!!subRows && subRows.length > 0) {
      break;
    }
  }
  return subRows;
};

export function getUnusedHeaderRows(
  allRows: Array<{
    colName?: string;
  }>,
  originalRows: Array<{
    colName?: string;
    isGroup?: boolean;
    children?: any[];
  }>,
): any[] {
  const oldFlattenedColNames = originalRows
    .flatMap(row => flattenHeaderRowsWithoutGroupRow(row))
    .map(r => r.colName);
  return (allRows || []).reduce<any[]>((acc, cur) => {
    if (!oldFlattenedColNames.includes(cur.colName)) {
      acc.push(cur);
    }
    return acc;
  }, []);
}

export function getDataColumnMaxAndMin(
  dataset: [],
  config?: ChartDataSectionField,
) {
  if (!config || !dataset?.length) {
    return { min: 0, max: 100 };
  }
  const datas = dataset.map(row => row[getValueByColumnKey(config)]);
  const min = Number.isNaN(Math.min(...datas)) ? 0 : Math.min(...datas);
  const max = Number.isNaN(Math.max(...datas)) ? 100 : Math.max(...datas);
  return { min, max };
}

export function getDataColumnMaxAndMin2(
  chartDataSetRows: IChartDataSetRow<string>[],
  config?: ChartDataSectionField,
) {
  if (!config || !chartDataSetRows?.length) {
    return { min: 0, max: 100 };
  }
  const datas = (chartDataSetRows || []).map(row =>
    Number(row.getCell(config)),
  );
  const min = Number.isNaN(Math.min(...datas)) ? 0 : Math.min(...datas);
  const max = Number.isNaN(Math.max(...datas)) ? 100 : Math.max(...datas);
  return { min, max };
}

export function getSeriesTooltips4Scatter(
  params,
  tooltipItemConfigs,
  start?: number,
) {
  const dataValues = params?.[0]?.value;
  return tooltipItemConfigs.map((config, index) =>
    valueFormatter(config, dataValues?.[!!start ? start + index : index]),
  );
}

export function getSeriesTooltips4Rectangular2(
  chartDataSet: IChartDataSet<string>,
  tooltipParam: {
    componentType: string;
    seriesName?: string;
    data: {
      name: string;
      rowData: { [key: string]: any };
    };
  },
  groupConfigs: ChartDataSectionField[],
  colorConfigs: ChartDataSectionField[],
  aggConfigs: ChartDataSectionField[],
  infoConfigs?: ChartDataSectionField[],
  sizeConfigs?: ChartDataSectionField[],
): string {
  if (tooltipParam?.componentType !== 'series') {
    return '';
  }
  const aggConfigName = tooltipParam?.data?.name || tooltipParam?.seriesName;
  const row = tooltipParam?.data?.rowData || {};

  const tooltips: string[] = ([] as any[])
    .concat(groupConfigs || [])
    .concat(colorConfigs || [])
    .concat(
      aggConfigs.filter(agg => getColumnRenderName(agg) === aggConfigName) ||
        [],
    )
    .concat(sizeConfigs || [])
    .concat(infoConfigs || [])
    .map(config =>
      valueFormatter(config, row?.[chartDataSet.getFieldOriginKey(config)]),
    );
  return tooltips.join('<br />');
}

export function getSeriesTooltips4Polar2(
  chartDataSet: IChartDataSet<string>,
  tooltipParam: {
    data: {
      name: string;
      rowData: { [key: string]: any };
    };
  },
  groupConfigs: ChartDataSectionField[],
  colorConfigs: ChartDataSectionField[],
  aggConfigs: ChartDataSectionField[],
  infoConfigs?: ChartDataSectionField[],
  sizeConfigs?: ChartDataSectionField[],
): string {
  const row = tooltipParam?.data?.rowData || {};
  const tooltips: string[] = ([] as any[])
    .concat(groupConfigs || [])
    .concat(colorConfigs || [])
    .concat(aggConfigs || [])
    .concat(sizeConfigs || [])
    .concat(infoConfigs || [])
    .map(config =>
      valueFormatter(config, row?.[chartDataSet.getFieldOriginKey(config)]),
    );
  return tooltips.join('<br />');
}

export function getSeriesTooltips4Rectangular(
  params,
  groupConfigs,
  aggConfigs,
  dataColumns,
) {
  if (!aggConfigs?.length) {
    return [];
  }
  if (!groupConfigs?.length) {
    return aggConfigs.map(config =>
      valueFormatter(config, dataColumns?.[0]?.[getValueByColumnKey(config)]),
    );
  }
  if (groupConfigs?.[0]) {
    const groupConfig = groupConfigs?.[0];
    const dataRow = dataColumns.find(
      dc => dc[getValueByColumnKey(groupConfig)] === params?.[0]?.axisValue,
    );
    return aggConfigs.map(config =>
      valueFormatter(config, dataRow?.[getValueByColumnKey(config)]),
    );
  }
  return [];
}
/**
 * [中文] 获取字段的Tooltip显示名称和内容
 * </br>
 * [EN] Get chart render string with field name and value
 * @example
 * const config = {
 *   aggregate: "SUM"
 *   colName: 'name',
 *   type: 'STRING',
 *   category: 'field',
 *   uid: '123456',
 * }
 * const formatValue = valueFormatter(config, '示例')；
 * console.log(formatValue) // SUM(name): 示例
 * @export
 * @param {ChartDataSectionField} [config]
 * @param {number} [value]
 * @return {string}
 */
export function valueFormatter(
  config?: ChartDataSectionField,
  value?: number,
): string {
  return `${getColumnRenderName(config)}: ${toFormattedValue(
    value,
    config?.format,
  )}`;
}

export function getScatterSymbolSizeFn(
  valueIndex: number,
  max,
  min,
  cycleRatio?: number,
) {
  min = Math.min(0, min);
  const scaleRatio = cycleRatio || 1;
  const defaultScatterPointPixelSize = 10;
  const distance = max - min === 0 ? 100 : max - min;

  return function (val) {
    return Math.max(
      3,
      ((val?.[valueIndex] - min) / distance) *
        scaleRatio *
        defaultScatterPointPixelSize *
        2,
    );
  };
}

export function getGridStyle(styles) {
  const [containLabel, left, right, bottom, top] = getStyles(
    styles,
    ['margin'],
    ['containLabel', 'marginLeft', 'marginRight', 'marginBottom', 'marginTop'],
  );
  return { left, right, bottom, top, containLabel };
}

// TODO(Stephen): tobe used chart DataSetRow model for all charts
export function getExtraSeriesRowData(data) {
  if (data instanceof ChartDataSetRow) {
    return {
      // NOTE: row data should be case sensitive except for data chart
      rowData: data?.convertToCaseSensitiveObject(),
    };
  }
  return {
    rowData: data,
  };
}

export function getExtraSeriesDataFormat(format?: IFieldFormatConfig) {
  return {
    format,
  };
}

export function getColorizeGroupSeriesColumns(
  chartDataSet: IChartDataSet<string>,
  groupConfig: ChartDataSectionField,
) {
  return Object.entries(chartDataSet.groupBy(groupConfig)).map(([k, v]) => {
    let a = {};
    a[k] = v;
    return a;
  });
}

/**
 * [中文] 是否满足当前meta中标识的限制要求，以满足图表绘制
 * </br>
 * [EN] Check if current config with requried fields match the chart basic requirement of meta info.
 *
 * @example
 *
 *  const meta = {
 *      requirements: [
 *        {
 *          group: [1, 999],
 *          aggregate: [1, 999],
 *        },
 *      ],
 *    };
 *    const config = {
 *     datas: [
 *        {
 *         type: 'group',
 *          required: true,
 *          rows: [
 *            {
 *              colName: 'category',
 *            },
 *          ],
 *        },
 *        {
 *          type: 'aggregate',
 *          required: true,
 *          rows: [
 *            {
 *              colName: 'amount',
 *            },
 *          ],
 *        },
 *      ],
 *    };
 *  const isMatch = isMatchRequirement(meta, config);
 *  console.log(isMatch); // true;
 *
 * @export
 * @param {ChartMetadata} meta
 * @param {ChartConfig} config
 * @return {boolean}
 */
export function isMatchRequirement(
  meta: ChartMetadata,
  config: ChartConfig,
): boolean {
  const dataConfigs = config.datas || [];
  const groupedFieldConfigs = getRequiredGroupedSections(dataConfigs).flatMap(
    config => config.rows || [],
  );
  const aggregateFieldConfigs = getRequiredAggregatedSections(
    dataConfigs,
  ).flatMap(config => config.rows || []);
  const requirements = meta.requirements || [];
  return requirements.some(r => {
    const group = r?.[ChartDataSectionType.GROUP];
    const aggregate = r?.[ChartDataSectionType.AGGREGATE];
    return (
      isInRange(group, groupedFieldConfigs.length) &&
      isInRange(aggregate, aggregateFieldConfigs.length)
    );
  });
}

// 获取是否展示刻度
export const getIntervalShow = interval =>
  interval !== 'auto' && interval !== null;

// 判断overflow 条件是否已生效
export function hadAxisLabelOverflowConfig(
  options?: ECBasicOption,
  horizon: boolean = false,
) {
  if (!options) return false;
  const axisName = !horizon ? 'xAxis' : 'yAxis';

  const axisLabelOpts = (options as unknown as any)[axisName]?.[0]?.axisLabel;
  if (!axisLabelOpts) return false;

  const { overflow, interval, show } = axisLabelOpts;

  return show && overflow && getIntervalShow(interval);
}

// 处理溢出情况
export function setOptionsByAxisLabelOverflow(config: ChartCommonConfig) {
  const { chart, xAxis, yAxis, grid, series, horizon = false } = config;

  const commonOpts = {
    grid,
    xAxis,
    yAxis,
    series,
  };

  // 如果是x轴需要截断，则取x轴数据
  const axisOpts = !horizon ? xAxis : yAxis;
  const axisName = !horizon ? 'xAxis' : 'yAxis';

  const data = axisOpts.data || [];

  const dataLength = data.length;

  // 拿到截断配置
  const overflow = axisOpts.axisLabel?.overflow;
  const show = axisOpts.axisLabel?.show;
  // 是否展示刻度，非刻度使用默认样式

  const showInterval = getIntervalShow(axisOpts.axisLabel?.interval);

  // 不展示刻度
  if (!show) return commonOpts;
  // 数据为空
  if (!dataLength) return commonOpts;

  commonOpts[axisName].axisLabel.hideOverlap = true;
  commonOpts[axisName].axisLabel.overflow = overflow;

  // 如果overflow为截断，则使用每段刻度来响应tooltip
  // 不破坏原有展示逻辑
  if (showInterval && overflow === 'truncate') {
    commonOpts[axisName].axisPointer = {
      show: true,
      type: 'shadow',
    };
  }

  // 获取x/y轴在model上的信息
  // @ts-ignore
  const axisModel = chart.getModel()?.getComponent(axisName);

  // 处理 每个刻度宽度
  const setWidth = width => {
    // 水平图表使用默认宽度
    if (horizon) return 40;
    return parseInt(String((width - dataLength * 8) / dataLength));
  };
  // model 渲染未完成的兼容性方案，一般只在图表初始化阶段，还没有拿到model。
  // 一般只会运行一次
  // 拿到model后就可使用更加精确的坐标轴宽高度等信息，所以处理可以略粗略
  const handlerWhenChartUnFinished = () => {
    commonOpts[axisName].axisLabel.width = showInterval
      ? setWidth(getAxisLengthByConfig(config))
      : void 0;
    return commonOpts;
  };

  // model未获取到，原因： 未渲染完成
  if (!axisModel) {
    handlerWhenChartUnFinished();
    return commonOpts;
  }
  // @ts-ignore
  const axisView = chart.getViewOfComponentModel(axisModel);

  const axisRect = axisView?.group?.getBoundingRect();

  if (!axisRect) {
    handlerWhenChartUnFinished();
    return commonOpts;
  }

  commonOpts[axisName].axisLabel.width = showInterval
    ? setWidth(axisRect.width)
    : void 0;

  return commonOpts;
}

export const getAutoFunnelTopPosition = (config: {
  chart: ECharts;
  height: number;
  sort: 'ascending' | 'descending' | 'none';
  legendPos: string;
}) => {
  const { chart, height, sort, legendPos } = config;
  if (legendPos !== 'left' && legendPos !== 'right') return 8;
  if (!height) return 16;
  // 升序
  if (sort === 'ascending') return 16;

  const chartHeight = chart.getHeight();
  if (!chartHeight) return 16;
  // 24 marginBottom
  return chartHeight - 24 - height;
};
