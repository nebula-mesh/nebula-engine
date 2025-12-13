/**
 * RateLimitPlugin 示例实现
 * 演示如何与 CachePlugin 配合工作
 */

import {
  HandlerMetadata,
  Microservice,
  Plugin,
  PluginModuleOptionsSchema,
} from "../../core/types";

export interface RateLimitOptions {
  maxRequests?: number; // 最大请求数
  windowMs?: number; // 时间窗口（毫秒）
  keyGenerator?: (methodName: string, ...args: any[]) => string; // 限流键生成器
}

export interface RateLimitModuleOptions {
  rateLimitMaxRequests?: number; // 模块级默认最大请求数
  rateLimitWindowMs?: number; // 模块级默认时间窗口
}

/**
 * RateLimitPlugin - 限流插件
 *
 * 执行顺序说明：
 * - 如果 RateLimitPlugin 在 CachePlugin 之前注册，限流在外层，缓存在内层
 *   请求流程：限流检查 → 缓存检查 → 业务逻辑
 * - 如果 RateLimitPlugin 在 CachePlugin 之后注册，缓存在外层，限流在内层
 *   请求流程：缓存检查 → 限流检查 → 业务逻辑
 *
 * 推荐顺序：RateLimitPlugin → CachePlugin
 * 这样可以避免缓存命中时仍然进行限流检查
 */
export class RateLimitPlugin implements Plugin<RateLimitModuleOptions> {
  public readonly name = "rate-limit-plugin";
  private requestCounts: Map<string, { count: number; resetAt: number }> =
    new Map();
  private defaultMaxRequests: number = 100;
  private defaultWindowMs: number = 60000; // 1分钟
  private engine: Microservice | null = null;

  getModuleOptionsSchema(): PluginModuleOptionsSchema<RateLimitModuleOptions> {
    return {
      _type: {} as RateLimitModuleOptions,
      validate: (options) => {
        if (
          options.rateLimitMaxRequests !== undefined &&
          options.rateLimitMaxRequests <= 0
        ) {
          return `rateLimitMaxRequests must be greater than 0`;
        }
        if (
          options.rateLimitWindowMs !== undefined &&
          options.rateLimitWindowMs <= 0
        ) {
          return `rateLimitWindowMs must be greater than 0`;
        }
        return true;
      },
    };
  }

  onInit(engine: Microservice): void {
    this.engine = engine;
    console.log("[RateLimitPlugin] Initialized rate limit storage");
  }

  onHandlerLoad(handlers: HandlerMetadata[]): void {
    // 筛选出所有 type="rate-limit" 的 Handler 元数据
    const rateLimitHandlers = handlers.filter(
      (handler) => handler.type === "rate-limit"
    );

    console.log(
      `[RateLimitPlugin] Found ${rateLimitHandlers.length} rate limit handlers`
    );

    // 遍历限流 Handler，包装方法
    // 注意：使用原型上的当前方法（可能已被其他插件包装），而不是 handler.method
    for (const handler of rateLimitHandlers) {
      const methodName = handler.methodName;
      const moduleClass = handler.module;
      const rateLimitOptions = handler.options as RateLimitOptions;

      // 获取模块元数据以读取配置
      const moduleMetadata = this.engine
        ?.getModules()
        .find((m) => m.clazz === moduleClass);

      if (!moduleMetadata) {
        console.warn(
          `[RateLimitPlugin] Module metadata not found for ${moduleClass.name}`
        );
        continue;
      }

      // 获取模块配置
      const moduleOptions = moduleMetadata.options as RateLimitModuleOptions;
      const maxRequests =
        rateLimitOptions.maxRequests ??
        moduleOptions?.rateLimitMaxRequests ??
        this.defaultMaxRequests;
      const windowMs =
        rateLimitOptions.windowMs ??
        moduleOptions?.rateLimitWindowMs ??
        this.defaultWindowMs;

      // 生成限流键的函数
      const keyGenerator =
        rateLimitOptions.keyGenerator ||
        ((methodName: string, ...args: any[]) =>
          `${methodName}:${JSON.stringify(args)}`);

      // 获取当前原型上的方法（可能已被其他插件包装）
      const prototype = moduleClass.prototype;
      const currentMethod = prototype[methodName];

      // 包装当前方法（支持插件链式包装）
      const rateLimitedMethod = async (...args: any[]) => {
        // 生成限流键
        const limitKey = keyGenerator(methodName, ...args);
        const now = Date.now();

        // 获取或初始化计数器
        let counter = this.requestCounts.get(limitKey);
        if (!counter || counter.resetAt <= now) {
          counter = { count: 0, resetAt: now + windowMs };
          this.requestCounts.set(limitKey, counter);
        }

        // 检查限流
        if (counter.count >= maxRequests) {
          console.log(
            `[RateLimitPlugin] Rate limit exceeded for ${limitKey} (${counter.count}/${maxRequests})`
          );
          throw new Error(
            `Rate limit exceeded: ${counter.count} requests in ${windowMs}ms`
          );
        }

        // 增加计数
        counter.count++;
        console.log(
          `[RateLimitPlugin] Request allowed for ${limitKey} (${counter.count}/${maxRequests})`
        );

        // 执行当前方法（可能是原始方法，也可能是被其他插件包装后的）
        const result = await currentMethod.apply(
          this.engine?.get(moduleClass),
          args
        );

        return result;
      };

      // 替换原型上的方法
      prototype[methodName] = rateLimitedMethod;

      console.log(
        `[RateLimitPlugin] Wrapped ${moduleClass.name}.${methodName} with rate limit (${maxRequests} requests per ${windowMs}ms)`
      );
    }
  }

  onDestroy(): void {
    this.requestCounts.clear();
    console.log("[RateLimitPlugin] Rate limit storage destroyed");
  }
}
