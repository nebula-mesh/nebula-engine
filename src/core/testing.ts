/**
 * 测试辅助模块
 * 提供常用的测试工具函数和类型，简化测试代码编写
 */

import { Factory } from "./factory";
import { MicroserviceOptions, Plugin } from "./types";

/**
 * 默认测试配置
 */
export const DEFAULT_TEST_OPTIONS = {
  name: "test-service",
  version: "1.0.0",
} as const;

/**
 * 创建测试引擎
 *
 * @example
 * ```ts
 * // 只传插件
 * const { engine, Module } = Testing.createTestEngine({
 *   plugins: [new CachePlugin()]
 * });
 *
 * // 传插件和 options
 * const { engine, Module } = Testing.createTestEngine({
 *   plugins: [new CachePlugin()],
 *   options: { prefix: "/api" }
 * });
 * ```
 */
function createTestEngine<TPlugins extends readonly Plugin<any>[]>(config: {
  plugins: TPlugins;
  options?: Partial<MicroserviceOptions>;
}): ReturnType<typeof Factory.create<TPlugins>> & {
  engine: InstanceType<
    ReturnType<typeof Factory.create<TPlugins>>["Microservice"]
  >;
} {
  const factory = Factory.create(...config.plugins);
  const Microservice = factory.Microservice;
  const engine = new Microservice({
    ...DEFAULT_TEST_OPTIONS,
    ...config.options,
  });

  return {
    ...factory,
    engine,
  };
}

/**
 * 等待指定时间（用于异步测试）
 *
 * @param ms 等待的毫秒数
 * @returns Promise
 */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 测试辅助工具命名空间
 * 所有测试相关的工具函数都通过这个命名空间导出，避免命名冲突
 */
export const Testing = {
  createTestEngine,
  DEFAULT_TEST_OPTIONS,
  wait,
} as const;
