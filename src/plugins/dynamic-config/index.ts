/**
 * Dynamic Config Plugin
 *
 * 提供基于 etcd 的动态配置功能，支持：
 * - 装饰器驱动的配置定义 (@Config)
 * - 实时配置热更新（通过 etcd watch 机制）
 * - 类型安全（Zod Schema 验证）
 * - 完美的 TypeScript 类型推断
 * - 自动同步访问（无需 await 或额外包装）
 * - 配置变更回调
 *
 * @example
 * ```typescript
 * // 1. 使用插件
 * const { Module, Microservice } = Factory.create(
 *   new DynamicConfigPlugin({ etcdClient })
 * );
 *
 * // 2. 定义配置
 * @Module("app-config")
 * class AppConfig {
 *   @Config({ key: "MAX_ATTEMPTS", defaultValue: 5 })
 *   maxAttempts!: number;
 * }
 *
 * // 3. 启动服务
 * await engine.start();
 *
 * // 4. 直接使用（自动同步访问）
 * const config = engine.get(AppConfig);
 * const limit = config.maxAttempts; // ✅ 不需要 await，完美的类型推断！
 * ```
 */

export { DynamicConfigPlugin } from "./plugin";
export { Config } from "./decorator";
export { EtcdConfigStorage, MemoryConfigStorage } from "./storage";

export type {
  DynamicConfigOptions,
  DynamicConfigPluginOptions,
  DynamicConfigModuleOptions,
  ConfigMetadata,
  ConfigStorage,
  ConfigItem,
  ConfigHistory,
} from "./types";
