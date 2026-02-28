import { MiddlewareHandler } from "hono";

/**
 * ConcurrencyLock 装饰器配置选项
 */
export interface ConcurrencyLockOptions {
  /**
   * 自定义 key 生成函数
   * 函数的返回值会用于生成锁的 hash key
   * 如果不提供，将使用所有入参生成 hash
   *
   * @example
   * ```typescript
   * @ConcurrencyLock({
   *   key: (id: string, options?: { draft: boolean }) => ({ id, draft: options?.draft }),
   *   timeout: 60000
   * })
   * ```
   */
  key?: (...args: any[]) => any;

  /**
   * 锁超时时间 (ms)
   * 防止持有锁的请求崩溃导致死锁
   * 同时也是阻塞等待的最长时间
   * 默认：60000 (1分钟)
   */
  timeout?: number;
}

/**
 * ConcurrencyLockPlugin 的 Module 配置
 */
export interface ConcurrencyLockModuleOptions {
  /**
   * 默认锁超时时间 (ms)
   * 作用于模块所有标记了 @ConcurrencyLock 的方法
   * 默认：60000 (1分钟)
   */
  concurrencyLockDefaultTimeout?: number;
}

/**
 * 锁适配器接口
 * 支持内存锁和分布式锁（Redis）
 */
export interface LockAdapter {
  /**
   * 尝试获取锁
   * @param key 锁的 key
   * @param ttl 锁的过期时间 (ms)
   * @returns 是否获取成功
   */
  acquire(key: string, ttl: number): Promise<boolean>;

  /**
   * 释放锁
   * @param key 锁的 key
   * @returns 是否释放成功
   */
  release(key: string): Promise<boolean>;

  /**
   * 检查锁是否存在（未被释放且未过期）
   * @param key 锁的 key
   * @returns 是否存在
   */
  isLocked(key: string): Promise<boolean>;

  /**
   * 检查锁是否已过期（持有者崩溃）
   * @param key 锁的 key
   * @returns 是否已过期
   */
  isExpired(key: string): Promise<boolean>;

  /**
   * 等待锁释放，包含过期检测和偷取机制
   * @param key 锁的 key
   * @param waitTimeout 等待超时时间 (ms)
   * @param lockTtl 锁的 TTL (ms)
   * @returns 是否成功获取锁（或兜底放行）
   */
  waitForUnlock(
    key: string,
    waitTimeout: number,
    lockTtl: number,
  ): Promise<boolean>;
}

/**
 * Redis 锁适配器配置
 */
export interface RedisLockAdapterOptions {
  /**
   * Redis 客户端实例
   * 支持 ioredis、node-redis 等
   */
  client: {
    set(
      key: string,
      value: string,
      expiryMode?: string,
      time?: number,
    ): Promise<string | null>;
    get(key: string): Promise<string | null>;
    del(key: string): Promise<number>;
    keys(pattern: string): Promise<string[]>;
    eval(
      script: string,
      numberOfKeys: number,
      ...keysAndArgs: (string | number)[]
    ): Promise<any>;
  };

  /**
   * 键前缀，用于区分不同应用的锁
   * 默认：'concurrency:'
   */
  keyPrefix?: string;
}

/**
 * 锁数据内部结构
 */
export interface LockData {
  owner: string;
  expiresAt: number;
  acquiredAt: number;
}
