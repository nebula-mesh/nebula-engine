/**
 * 核心类型定义
 */

import { Microservice } from "./engine";

// 模块类类型
export type Class = new (...args: any[]) => any;

/**
 * 插件Module配置Schema（运行时+类型双维度）
 */
export interface PluginModuleOptionsSchema<T = Record<string, any>> {
  // 类型标记：仅用于TypeScript推导，运行时无值
  _type: T;
  // 运行时校验规则（可选）
  validate?: (options: T) => boolean | string;
}

/**
 * 插件优先级
 * 数值越小，优先级越高（越先执行）
 * 引擎会自动按优先级排序，用户无需关心注册顺序
 */
export enum PluginPriority {
  /**
   * 系统级优先级：系统核心功能插件（优雅停机等）
   * 最高优先级，应该最先执行
   */
  SYSTEM = 50,

  /**
   * 最高优先级：安全相关插件（限流、认证等）
   * 应该最先执行，快速拒绝无效请求
   */
  SECURITY = 100,

  /**
   * 高优先级：日志、监控等插件
   * 记录所有请求，包括被安全插件拒绝的
   */
  LOGGING = 200,

  /**
   * 中优先级：业务逻辑插件（数据转换等）
   * 在安全和日志之后执行
   */
  BUSINESS = 300,

  /**
   * 低优先级：性能优化插件（缓存等）
   * 在业务逻辑之后执行，避免重复计算
   */
  PERFORMANCE = 400,

  /**
   * 最低优先级：路由插件
   * 必须最后执行，注册HTTP路由
   */
  ROUTE = 1000,
}

/**
 * 核心插件接口
 */
export interface Plugin<TModuleOptions = Record<string, any>> {
  // 插件唯一名称
  name: string;

  /**
   * 插件优先级（可选）
   * 如果不指定，默认为 PluginPriority.BUSINESS
   * 引擎会自动按优先级排序，用户无需关心注册顺序
   *
   * 优先级规则：
   * - 数值越小，优先级越高（越先执行）
   * - 相同优先级按注册顺序执行
   */
  priority?: PluginPriority | number;

  // 声明插件的Module配置Schema（核心：用于类型推导+运行时校验）
  getModuleOptionsSchema?: () => PluginModuleOptionsSchema<TModuleOptions>;
  // 生命周期钩子
  onInit?: (engine: Microservice) => void;
  onModuleLoad?: (modules: ModuleMetadata[]) => void;
  // Handler加载钩子：平铺的HandlerMetadata数组，每个装饰器都是独立条目
  // 引擎会自动按优先级排序，用户无需关心注册顺序
  onHandlerLoad?: (handlers: HandlerMetadata[]) => void;
  onBeforeStart?: (engine: Microservice) => void;
  onAfterStart?: (engine: Microservice) => void | Promise<void>;
  onDestroy?: () => void | Promise<void>;
}

/**
 * 引擎创建选项
 */
export interface MicroserviceOptions {
  name: string; // 服务名称
  version: string; // 语义化版本
  hostname?: string; // 绑定主机名（默认0.0.0.0）
  prefix?: string; // 路由前缀（默认""，用于Action插件的路由注册）
}

/**
 * Module装饰器类型（由引擎实例创建，自动推导类型）
 * 使用最新的 Stage 3 装饰器标准
 */
export type ModuleDecorator<TOptions = Record<string, any>> = (
  name: string,
  options?: TOptions
) => (target: Class, context: ClassDecoratorContext) => void;

/**
 * 模块元数据
 */
export interface ModuleMetadata<TOptions = Record<string, any>> {
  name: string;
  clazz: Class;
  options: TOptions;
}

/**
 * Handler包装函数类型
 * 插件只需要提供这个函数，引擎自动管理包装链
 *
 * @param next 调用下一个包装层或原始方法
 * @param instance 模块实例
 * @param args 方法参数
 * @returns 方法执行结果
 */
export type HandlerWrapper = (
  next: () => Promise<any> | any,
  instance: any,
  ...args: any[]
) => Promise<any> | any;

/**
 * Handler元数据（单组元数据）
 * 提供简单的 wrap API，引擎自动管理包装链和执行顺序
 */
export interface HandlerMetadata {
  type: string; // 元数据类型（如route/cache/rate-limit）
  options: Record<string, any>; // 该类型对应的自定义配置
  method: Function; // 关联的模块方法（原始方法，仅供内部使用）
  methodName: string; // 方法名称
  module: Class; // 所属模块类

  /**
   * 包装当前方法（引擎自动管理包装链）
   *
   * 插件只需要调用这个方法，引擎会自动：
   * - 按插件优先级构建包装链
   * - 确保 RoutePlugin 最后执行
   * - 自动应用包装到原型
   *
   * @param wrapper 包装函数
   *   - next: 调用下一个包装层或原始方法
   *   - instance: 模块实例
   *   - args: 方法参数
   *
   * @example
   * ```typescript
   * handler.wrap(async (next, instance, ...args) => {
   *   // 前置逻辑
   *   const result = await next();
   *   // 后置逻辑
   *   return result;
   * });
   * ```
   */
  wrap(wrapper: HandlerWrapper): void;
}

/**
 * Stage 3 装饰器上下文类型
 */
export type ClassDecoratorContext = {
  kind: "class";
  name: string | undefined;
  addInitializer(initializer: () => void): void;
};

export type ClassMethodDecoratorContext = {
  kind: "method";
  name: string | symbol;
  static: boolean;
  private: boolean;
  addInitializer(initializer: () => void): void;
};

export type { Microservice };
