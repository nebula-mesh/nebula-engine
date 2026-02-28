import { Microservice } from "../../core/engine";
import logger from "../../core/logger";
import {
  HandlerMetadata,
  Plugin,
  PluginModuleOptionsSchema,
  PluginPriority,
} from "../../core/types";
import { ConcurrencyLockModuleOptions, ConcurrencyLockOptions } from "./types";
import { LockAdapter, MemoryLockAdapter, RedisLockAdapter } from "./adapter";
import { generateLockKey } from "./utils";

/**
 * 并发锁错误
 */
export class ConcurrencyLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConcurrencyLockError";
  }
}

/**
 * 并发锁超时错误
 */
export class ConcurrencyLockTimeoutError extends Error {
  constructor(key: string) {
    super(`Concurrency lock timeout: ${key}`);
    this.name = "ConcurrencyLockTimeoutError";
  }
}

/**
 * ConcurrencyLockPlugin - 并发锁插件
 * 防止并发调用导致重复执行耗时操作（如生成内容、调用外部 API 等）
 *
 * @example
 * ```typescript
 * // 创建插件（使用内存锁）
 * const lockPlugin = new ConcurrencyLockPlugin();
 *
 * // 或使用 Redis 锁（分布式场景）
 * const lockPlugin = new ConcurrencyLockPlugin({
 *   redisClient: redisClient
 * });
 *
 * const { Module } = Factory.create(
 *   new ActionPlugin(),
 *   lockPlugin
 * );
 * ```
 */
export class ConcurrencyLockPlugin implements Plugin<ConcurrencyLockModuleOptions> {
  public readonly name = "concurrency-lock-plugin";
  public readonly priority = PluginPriority.PERFORMANCE;

  private adapter: LockAdapter;
  private engine: Microservice | null = null;
  private defaultTimeout: number = 60000;

  /**
   * 构造函数
   * @param options 配置选项
   */
  constructor(options?: { redisClient?: RedisLockAdapter["client"] }) {
    if (options?.redisClient) {
      this.adapter = new RedisLockAdapter({
        client: options.redisClient,
      });
    } else {
      this.adapter = new MemoryLockAdapter();
    }
  }

  /**
   * 声明 Module 配置 Schema
   */
  getModuleOptionsSchema(): PluginModuleOptionsSchema<ConcurrencyLockModuleOptions> {
    return {
      _type: {} as ConcurrencyLockModuleOptions,
      validate: (options) => {
        if (
          options.concurrencyLockDefaultTimeout !== undefined &&
          options.concurrencyLockDefaultTimeout < 0
        ) {
          return `concurrencyLockDefaultTimeout must be >= 0`;
        }
        return true;
      },
    };
  }

  /**
   * 引擎初始化钩子
   */
  onInit(engine: Microservice): void {
    this.engine = engine;
    logger.info("ConcurrencyLockPlugin initialized");
  }

  /**
   * Handler 加载钩子
   * 拦截带有 type="concurrency-lock" 的 Handler，包装原始方法实现并发控制
   */
  onHandlerLoad(handlers: HandlerMetadata[]): void {
    const lockHandlers = handlers.filter(
      (handler) => handler.type === "concurrency-lock",
    );

    logger.info(`Found ${lockHandlers.length} concurrency lock handler(s)`);

    for (const handler of lockHandlers) {
      const methodName = handler.methodName;
      const moduleClass = handler.module;
      const lockOptions = (handler.options || {}) as ConcurrencyLockOptions;

      // 获取模块元数据以读取配置
      const moduleMetadata = this.engine
        ?.getModules()
        .find((m: any) => m.clazz === moduleClass);

      if (!moduleMetadata) {
        logger.warn(
          `Module metadata not found for ${moduleClass.name}, skipping concurrency lock`,
        );
        continue;
      }

      // 获取模块配置
      const moduleOptions =
        moduleMetadata.options as ConcurrencyLockModuleOptions;
      const moduleDefaultTimeout =
        moduleOptions?.concurrencyLockDefaultTimeout ?? this.defaultTimeout;

      // 确定超时时间
      const timeout = lockOptions.timeout ?? moduleDefaultTimeout;

      // 获取模块名
      const moduleName = moduleMetadata.name;

      // 使用 wrap API 包装方法
      handler.wrap(async (next, instance, ...args) => {
        // 生成锁 key（精确到模块 + 方法 + 参数 hash）
        const lockKey = generateLockKey(
          moduleName,
          methodName,
          args,
          lockOptions.key,
        );

        // 尝试获取锁
        const acquired = await this.adapter.acquire(lockKey, timeout);

        if (acquired) {
          // 获取锁成功，执行方法后释放锁
          try {
            return await next();
          } finally {
            await this.adapter.release(lockKey);
          }
        }

        // 获取锁失败，等待锁释放
        // 使用超时兜底：等待超时后直接执行（不再加锁）
        const waited = await this.adapter.waitForUnlock(
          lockKey,
          timeout,
          timeout,
        );

        if (!waited) {
          // 等待超时，抛出错误
          logger.warn(
            `Concurrency lock wait timeout for ${moduleName}.${methodName}, proceeding anyway`,
          );
        }

        // 锁已释放或等待超时，直接执行（不再加锁）
        // 此时资源应该已生成，直接返回结果
        return await next();
      });

      logger.info(
        `[ConcurrencyLock] Wrapped ${moduleClass.name}.${methodName} (timeout: ${timeout}ms)`,
      );
    }
  }

  /**
   * 销毁钩子
   */
  async onDestroy(): Promise<void> {
    // 如果是内存锁适配器，可以在这里清理
    if (this.adapter instanceof MemoryLockAdapter) {
      await (this.adapter as MemoryLockAdapter).clear();
      logger.info("ConcurrencyLockPlugin memory locks cleared");
    }
  }

  /**
   * 获取适配器（用于调试和测试）
   */
  getAdapter(): LockAdapter {
    return this.adapter;
  }
}
