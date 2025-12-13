/**
 * 调度模式
 */
export enum ScheduleMode {
  /**
   * 固定频率模式：无论任务执行时间多长，都会按照固定间隔执行
   * 例如：每 5 秒执行一次，即使上次任务执行了 10 秒
   */
  FIXED_RATE = "FIXED_RATE",

  /**
   * 固定延迟模式：任务执行完成后，等待固定间隔再执行下一次
   * 例如：任务执行了 10 秒，间隔 5 秒，则下次执行在 15 秒后
   */
  FIXED_DELAY = "FIXED_DELAY",
}

/**
 * 调度选项
 */
export interface ScheduleOptions {
  /**
   * 执行间隔（毫秒）
   */
  interval: number;

  /**
   * 调度模式（默认 FIXED_RATE）
   */
  mode?: ScheduleMode;
}

/**
 * 调度元数据
 */
export interface ScheduleMetadata {
  /**
   * 方法名称
   */
  name: string;

  /**
   * 执行间隔（毫秒）
   */
  interval: number;

  /**
   * 调度模式
   */
  mode: ScheduleMode;
}

/**
 * SchedulePlugin 配置选项
 */
export interface SchedulePluginOptions {
  /**
   * Etcd3 客户端实例
   * 如果未提供且 useMockEtcd 为 false，插件将不会启动调度任务
   */
  etcdClient?: Etcd3;

  /**
   * 是否使用 Mock Etcd（用于测试和本地开发）
   * 当设置为 true 时，将使用内置的 MockEtcd3，始终选举自己作为 leader
   * 这样可以在没有真实 etcd 的情况下运行调度任务
   * 
   * @default false
   */
  useMockEtcd?: boolean;
}

/**
 * Etcd3 类型定义（避免直接依赖 etcd3 包）
 * 这些类型定义与 etcd3@1.1.2 的实际类型兼容
 */
export interface Etcd3 {
  election(key: string, ttl: number): Election;
  close(): void;
  delete(): any;
  get(key: string): any;
}

export interface Election {
  observe(): Promise<Observer>;
  campaign(candidate: string): Campaign;
}

export interface Observer {
  on(event: "change", callback: (leader: string | undefined) => void): Observer;
  on(event: "disconnected", callback: (error: Error) => void): Observer;
  on(event: "error", callback: (error: Error) => void): Observer;
}

export interface Campaign {
  on(event: "error", callback: (error: any) => void): Campaign;
  on(event: "elected", callback: () => void): Campaign;
  resign(): Promise<void>;
}

