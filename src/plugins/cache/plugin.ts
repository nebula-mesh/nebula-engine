import { createHash } from "crypto";
import * as ejson from "ejson";
import { Microservice } from "../../core/engine";
import logger from "../../core/logger";
import {
  HandlerMetadata,
  Plugin,
  PluginModuleOptionsSchema,
  PluginPriority,
} from "../../core/types";
import { CacheAdapter, MemoryCacheAdapter } from "./adapter";
import { CacheModuleOptions } from "./types";
import { RequestContext } from "../telemetry/context";

/**
 * CachePlugin - 缓存插件
 * 负责为标记了 @Cache 装饰器的方法提供缓存功能
 *
 * @example
 * ```ts
 * // 使用内存缓存（默认）
 * const cachePlugin = new CachePlugin();
 *
 * // 使用自定义适配器
 * const cachePlugin = new CachePlugin(new MemoryCacheAdapter());
 *
 * // 使用 Redis 适配器
 * import { RedisCacheAdapter } from "./adapter";
 * const cachePlugin = new CachePlugin(new RedisCacheAdapter({ client: redisClient }));
 * ```
 */
export class CachePlugin implements Plugin<CacheModuleOptions> {
  public readonly name = "cache-plugin";
  public readonly priority = PluginPriority.PERFORMANCE; // 性能优化插件，优先级较低

  // 缓存适配器
  private adapter: CacheAdapter;

  // 清理定时器
  private cleanupTimer: NodeJS.Timeout | null = null;

  // 引擎引用
  private engine: Microservice | null = null;

  // 模块配置
  private defaultTtl: number = 60000; // 默认1分钟
  private cacheEnabled: boolean = true;
  private cleanupInterval: number = 60000; // 默认1分钟清理一次

  /**
   * 构造函数
   * @param adapter 缓存适配器，如果不提供则使用默认的内存缓存适配器
   */
  constructor(adapter?: CacheAdapter) {
    this.adapter = adapter || new MemoryCacheAdapter();
  }

  /**
   * 声明Module配置Schema
   */
  getModuleOptionsSchema(): PluginModuleOptionsSchema<CacheModuleOptions> {
    return {
      _type: {} as CacheModuleOptions,
      validate: (options) => {
        if (
          options.cacheDefaultTtl !== undefined &&
          options.cacheDefaultTtl < 0
        ) {
          return `cacheDefaultTtl must be >= 0`;
        }
        if (
          options.cacheCleanupInterval !== undefined &&
          options.cacheCleanupInterval < 0
        ) {
          return `cacheCleanupInterval must be >= 0`;
        }
        return true;
      },
    };
  }

  /**
   * 引擎初始化前钩子
   */
  onInit(engine: Microservice): void {
    this.engine = engine;
    logger.info("CachePlugin initialized cache storage");
  }

  /**
   * Handler加载后钩子
   * 拦截带有 type="cache" 的 Handler，包装原始方法实现缓存逻辑
   */
  onHandlerLoad(handlers: HandlerMetadata[]): void {
    // 筛选出所有type="cache"的Handler元数据
    const cacheHandlers = handlers.filter(
      (handler) => handler.type === "cache",
    );

    logger.info(`Found ${cacheHandlers.length} cache handler(s)`);

    // 遍历缓存Handler，包装方法
    // 注意：使用原型上的当前方法（可能已被其他插件包装），而不是 handler.method
    for (const handler of cacheHandlers) {
      const methodName = handler.methodName;
      const moduleClass = handler.module;
      const cacheOptions = handler.options || {};

      // 获取模块元数据以读取配置
      const moduleMetadata = this.engine
        ?.getModules()
        .find((m) => m.clazz === moduleClass);

      if (!moduleMetadata) {
        logger.warn(`Module metadata not found for ${moduleClass.name}`);
        continue;
      }

      // 获取模块配置
      const moduleOptions = moduleMetadata.options as CacheModuleOptions;
      const moduleDefaultTtl =
        moduleOptions?.cacheDefaultTtl ?? this.defaultTtl;
      const moduleCacheEnabled =
        moduleOptions?.cacheEnabled ?? this.cacheEnabled;

      // 确定TTL
      const ttl = cacheOptions.ttl ?? moduleDefaultTtl;
      const enabled = cacheOptions.enabled ?? moduleCacheEnabled;

      if (!enabled) {
        logger.info(`Cache disabled for ${moduleClass.name}.${methodName}`);
        continue;
      }

      // 获取模块名
      const moduleName = moduleMetadata.name;

      // 使用简单的 wrap API，引擎自动管理包装链
      handler.wrap(async (next, instance, ...args) => {
        // 生成缓存键
        const cacheKey = this.generateCacheKey(
          moduleName,
          methodName,
          cacheOptions.key,
          args,
        );

        // 检查缓存
        const cached = await this.adapter.get(cacheKey);
        if (cached) {
          logger.debug(`Cache hit for ${cacheKey}`);
          RequestContext.setCacheInfo(true);
          return cached.value;
        }

        // 缓存未命中，调用下一个包装层或原始方法
        logger.debug(`Cache miss for ${cacheKey}`);
        RequestContext.setCacheInfo(false);
        const result = await next();

        // 存储到缓存
        await this.adapter.set(cacheKey, {
          value: result,
          expiresAt: Date.now() + ttl,
          createdAt: Date.now(),
        });

        return result;
      });

      logger.info(
        `Wrapped ${moduleClass.name}.${methodName} with cache (TTL: ${ttl}ms)`,
      );
    }
  }

  /**
   * 引擎启动前钩子
   */
  onBeforeStart(engine: Microservice): void {
    // 启动缓存清理定时器
    const moduleOptions = engine.options as CacheModuleOptions;
    const cleanupInterval =
      moduleOptions?.cacheCleanupInterval ?? this.cleanupInterval;

    if (cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => {
        this.cleanup().catch((error) => {
          logger.error("Cache cleanup failed", error);
        });
      }, cleanupInterval);

      logger.info(
        `Started cache cleanup timer (interval: ${cleanupInterval}ms)`,
      );
    }
  }

  /**
   * 引擎停止时钩子
   */
  async onDestroy(): Promise<void> {
    // 清理定时器
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // 清空缓存
    await this.adapter.clear();
    logger.info("Cache storage cleared");
  }

  /**
   * 生成缓存键
   * @param moduleName 模块名
   * @param methodName 方法名
   * @param keyFunction 可选的 key 函数
   * @param args 方法参数
   * @returns 缓存键（格式：模块名:方法名:hash）
   */
  private generateCacheKey(
    moduleName: string,
    methodName: string,
    keyFunction: ((...args: any[]) => any) | undefined,
    args: any[],
  ): string {
    // 如果提供了 key 函数，使用它的返回值；否则使用 args
    const keyData = keyFunction ? keyFunction(...args) : args;

    // 使用 ejson 序列化
    const serialized = ejson.stringify(keyData);

    // 生成 hash（使用 SHA256）
    const hash = createHash("sha256").update(serialized).digest("hex");

    // 返回格式：模块名:方法名:hash
    return `${moduleName}:${methodName}:${hash}`;
  }

  /**
   * 清理过期缓存
   */
  private async cleanup(): Promise<void> {
    // 如果适配器支持 cleanupExpired，使用更高效的方法
    if (typeof this.adapter.cleanupExpired === "function") {
      const cleaned = await this.adapter.cleanupExpired();
      if (cleaned > 0) {
        logger.debug(`Cleaned up ${cleaned} expired cache entry(ies)`);
      }
    } else {
      // 降级方案：通过 keys() + get() + delete() 清理
      const now = Date.now();
      let cleaned = 0;

      const keys = await this.adapter.keys();
      for (const key of keys) {
        const item = await this.adapter.get(key);
        if (!item || item.expiresAt <= now) {
          await this.adapter.delete(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.debug(`Cleaned up ${cleaned} expired cache entry(ies)`);
      }
    }
  }

  /**
   * 获取缓存统计信息
   */
  async getStats(): Promise<{
    size: number;
    entries: Array<{ key: string; expiresAt: number; createdAt: number }>;
  }> {
    return await this.adapter.getStats();
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    await this.adapter.clear();
    logger.info("All cache cleared");
  }

  /**
   * 删除指定的缓存项
   */
  async delete(key: string): Promise<boolean> {
    return await this.adapter.delete(key);
  }
}
