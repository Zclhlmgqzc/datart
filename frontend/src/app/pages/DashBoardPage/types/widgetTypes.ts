import {
  ChartDataConfig,
  ChartI18NSectionConfig,
  ChartStyleConfig,
} from 'app/types/ChartConfig';
import {
  BoardType,
  JumpConfig,
  LinkageConfig,
  RectConfig,
  Relation,
  VizRenderMode,
  WidgetType,
} from '../pages/Board/slice/types';

export interface Widget {
  id: string;
  dashboardId: string;
  datachartId: string;
  relations: Relation[];
  viewIds: string[];
  config: WidgetConf;
  parentId?: string;
}
export type CustomConfig = {
  datas?: ChartDataConfig[];
  props?: ChartStyleConfig[];
  settings?: ChartStyleConfig[];
  i18ns?: ChartI18NSectionConfig[];
};
export interface WidgetConf {
  version: string;
  name: string;
  boardType: BoardType;
  clientId: string; // replace tabId
  index: number;
  type: WidgetType; //WidgetType
  originalType: string;
  lock: boolean;

  // visible: boolean; // 是否可见 TODO: 后续考虑
  customConfig: CustomConfig;
  content?: any;
  rect: RectConfig;
  mRect?: RectConfig;
  parentId?: string;
  children?: string[];
  linkageConfig?: LinkageConfig; //联动设置 TODO: in selfConfig
  jumpConfig?: JumpConfig; // 跳转 设置 TODO: in selfConfig
}

export interface WidgetCreateProps {
  dashboardId: string;
  name?: string;
  boardType?: BoardType;
  datachartId?: string;
  relations?: Relation[];
  content?: any;
  viewIds?: string[];
  parentId?: string;
}
export type WidgetTplProps = WidgetCreateProps & {
  widgetTypeId: string;
};
export interface WidgetToolkit {
  create: (T: WidgetCreateProps) => Widget;
  getName: (local?: string) => string;
  getDropDownList: (
    widgetConf: WidgetConf,
    supportTrigger?: boolean,
  ) => WidgetActionListItem<widgetActionType>[];
  edit?: () => void;
  save?: () => void;

  // lock?() {},
  // unlock?() {},
  // copy() {},
  // paste() {},
  // delete() {},
  // changeTitle() {},
  // getMeta() {},
  // getWidgetName() {},
  // //
  // setLinkage() {},
  // closeLinkage() {},
  // setJump() {},
  // closeJump() {},
}

export interface WidgetMeta {
  icon: any;
  widgetTypeId: string;
  canWrapped: boolean; // 是否可以被包裹 被 widget container 包裹
  controllable: boolean; // 是否可以 被 controller 关联
  linkable: boolean; // 是否可以 被 widget 联动
  canFullScreen: boolean; // 是否出现在全屏列表
  viewAction: Record<string, { label: string; icon: any; key: string }>;
  editAction: Record<string, { label: string; icon: any; key: string }>;
  i18ns: ChartI18NSectionConfig[];
}

export interface ITimeDefault {
  format: string;
  duration: number;
}
export interface WidgetActionListItem<T> {
  key: T;
  label?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  color?: string;
  danger?: boolean;
  divider?: boolean;
  show?: boolean;
  renderMode?: VizRenderMode[];
}

export const widgetActionTypes = [
  'refresh',
  'fullScreen',
  'delete',
  'info',
  'edit',
  'makeLinkage',
  'clearLinkage',
  'closeLinkage',
  'makeJump',
  'closeJump',
  'lock',
  'unlock',
] as const;
export type widgetActionType = typeof widgetActionTypes[number];
