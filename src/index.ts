/**
 * IMean Service Engine - 微服务引擎框架
 */

// 核心类型
export * from "./core/types";

// 导出插件优先级枚举，方便插件开发者使用
export { PluginPriority } from "./core/types";

// 装饰器
export { Handler } from "./core/decorators";

// 异常
export * from "./core/errors";

// 预检
export * from "./core/checker";

// Route插件
export * from "./plugins/route";

// Action插件
export * from "./plugins/action";

// Cache插件
export * from "./plugins/cache";

// GracefulShutdown插件
export * from "./plugins/graceful-shutdown";

// Schedule插件
export * from "./plugins/schedule";

// clientCode插件
export * from "./plugins/client-code";

// 动态配置插件 (Dynamic Config Plugin)
export * from "./plugins/dynamic-config";

// 便捷导出：引擎创建函数（仅通过 Factory 创建）
export { Factory } from "./core/factory";
export type { MicroserviceOptions } from "./core/types";

// 测试辅助工具（仅在测试环境中使用）
export * from "./core/testing";

// 导出 zod（固定版本，用户可以直接从主包导入）
export { z } from "zod";

// 导出 hono
export { Context, MiddlewareHandler } from "hono";

// 导出 logger
export { default as logger } from "./core/logger";

// 导出 imeanId
export { imeanId, IMEAN_ID_ALPHABET } from "./core/imean-id";
