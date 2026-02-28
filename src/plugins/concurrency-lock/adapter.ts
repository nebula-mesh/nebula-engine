import * as ejson from "ejson";
import { LockAdapter, LockData, RedisLockAdapterOptions } from "./types";
import { generateHash, sleep } from "./utils";

export type { LockAdapter } from "./types";

/**
 * 内存锁适配器
 * 使用 Map 存储锁信息，适合单进程应用
 *
 * 注意：
 * 1. 过期项会在 get/isLocked/isExpired 时检查并清理
 * 2. 不支持分布式，只适合单实例场景
 */
export class MemoryLockAdapter implements LockAdapter {
  private locks: Map<string, LockData> = new Map();

  /**
   * 尝试获取锁
   * 使用原子操作：先检查后设置
   */
  async acquire(key: string, ttl: number): Promise<boolean> {
    const now = Date.now();

    // 检查锁是否存在且未过期
    const existing = this.locks.get(key);
    if (existing && existing.expiresAt > now) {
      // 锁存在且未过期，获取失败
      return false;
    }

    // 获取锁
    const lockData: LockData = {
      owner: generateHash({ key, timestamp: now }),
      expiresAt: now + ttl,
      acquiredAt: now,
    };

    this.locks.set(key, lockData);
    return true;
  }

  /**
   * 释放锁
   * 只有锁的持有者才能释放（这里简化为直接删除）
   */
  async release(key: string): Promise<boolean> {
    const existed = this.locks.has(key);
    this.locks.delete(key);
    return existed;
  }

  /**
   * 检查锁是否存在（未被释放且未过期）
   */
  async isLocked(key: string): Promise<boolean> {
    const lockData = this.locks.get(key);
    if (!lockData) {
      return false;
    }

    // 检查是否过期，过期则删除
    if (lockData.expiresAt <= Date.now()) {
      this.locks.delete(key);
      return false;
    }

    return true;
  }

  /**
   * 检查锁是否已过期（持有者崩溃）
   */
  async isExpired(key: string): Promise<boolean> {
    const lockData = this.locks.get(key);
    if (!lockData) {
      return true; // 锁不存在，视为过期
    }

    const expired = lockData.expiresAt <= Date.now();
    if (expired) {
      // 自动清理过期锁
      this.locks.delete(key);
    }

    return expired;
  }

  /**
   * 等待锁释放，包含过期检测和偷取机制
   */
  async waitForUnlock(
    key: string,
    waitTimeout: number,
    lockTtl: number,
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < waitTimeout) {
      // 1. 检查锁是否还存在
      const locked = await this.isLocked(key);
      if (!locked) {
        // 锁已释放，尝试获取
        const acquired = await this.acquire(key, lockTtl);
        if (acquired) {
          return true;
        }
        // 被其他请求抢走了，继续等待
      }

      // 2. 检查锁是否已过期（持有者崩溃）
      const expired = await this.isExpired(key);
      if (expired) {
        // 锁已过期，尝试偷取
        const stolen = await this.acquire(key, lockTtl);
        if (stolen) {
          return true;
        }
        // 被其他请求抢走了，继续等待
      }

      // 3. 随机退避，避免惊群
      const delay = 50 + Math.random() * 50;
      await sleep(delay);
    }

    // 4. 等待超时，兜底放行（不再加锁）
    return true;
  }

  /**
   * 清空所有锁（用于测试）
   */
  async clear(): Promise<void> {
    this.locks.clear();
  }

  /**
   * 获取锁统计信息（用于调试）
   */
  getStats(): {
    size: number;
    locks: Array<{ key: string; expiresAt: number }>;
  } {
    const now = Date.now();
    const validLocks: Array<{ key: string; expiresAt: number }> = [];

    for (const [key, data] of this.locks.entries()) {
      if (data.expiresAt > now) {
        validLocks.push({ key, expiresAt: data.expiresAt });
      } else {
        this.locks.delete(key);
      }
    }

    return {
      size: validLocks.length,
      locks: validLocks,
    };
  }
}

/**
 * Redis 锁适配器
 * 使用 SET NX EX 实现分布式锁
 */
export class RedisLockAdapter implements LockAdapter {
  private client: RedisLockAdapterOptions["client"];
  private keyPrefix: string;

  constructor(options: RedisLockAdapterOptions) {
    this.client = options.client;
    this.keyPrefix = options.keyPrefix || "concurrency:";
  }

  private getKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  /**
   * 尝试获取锁
   * 使用 SET key value NX EX ttl 原子操作
   */
  async acquire(key: string, ttl: number): Promise<boolean> {
    const redisKey = this.getKey(key);
    const owner = generateHash({ key, timestamp: Date.now() });
    const value = ejson.stringify({ owner, expiresAt: Date.now() + ttl });

    // SET key value NX EX ttl - 原子操作
    const result = await this.client.set(
      redisKey,
      value,
      "NX",
      Math.ceil(ttl / 1000),
    );

    return result !== null;
  }

  /**
   * 释放锁
   * 使用 Lua 脚本确保原子性：只有锁的持有者才能释放
   */
  async release(key: string): Promise<boolean> {
    const redisKey = this.getKey(key);

    // Lua 脚本：只有当锁的持有者才能删除
    const script = `
      local val = redis.call('GET', KEYS[1])
      if val then
        redis.call('DEL', KEYS[1])
        return 1
      end
      return 0
    `;

    const result = await this.client.eval(script, 1, redisKey);
    return result === 1 || result === true;
  }

  /**
   * 检查锁是否存在（未被释放且未过期）
   */
  async isLocked(key: string): Promise<boolean> {
    const redisKey = this.getKey(key);
    const data = await this.client.get(redisKey);

    if (!data) {
      return false;
    }

    try {
      const lockData: LockData = ejson.parse(data);
      const isExpired = lockData.expiresAt <= Date.now();

      if (isExpired) {
        // 自动清理过期锁
        await this.client.del(redisKey);
        return false;
      }

      return true;
    } catch {
      // 解析失败，视为无效
      return false;
    }
  }

  /**
   * 检查锁是否已过期（持有者崩溃）
   */
  async isExpired(key: string): Promise<boolean> {
    const redisKey = this.getKey(key);
    const data = await this.client.get(redisKey);

    if (!data) {
      return true; // 锁不存在，视为过期
    }

    try {
      const lockData: LockData = ejson.parse(data);
      const expired = lockData.expiresAt <= Date.now();

      if (expired) {
        // 自动清理过期锁
        await this.client.del(redisKey);
      }

      return expired;
    } catch {
      // 解析失败，视为过期
      return true;
    }
  }

  /**
   * 等待锁释放，包含过期检测和偷取机制
   */
  async waitForUnlock(
    key: string,
    waitTimeout: number,
    lockTtl: number,
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < waitTimeout) {
      // 1. 检查锁是否还存在
      const locked = await this.isLocked(key);
      if (!locked) {
        // 锁已释放，尝试获取
        const acquired = await this.acquire(key, lockTtl);
        if (acquired) {
          return true;
        }
        // 被其他请求抢走了，继续等待
      }

      // 2. 检查锁是否已过期（持有者崩溃）
      const expired = await this.isExpired(key);
      if (expired) {
        // 锁已过期，尝试偷取
        const stolen = await this.acquire(key, lockTtl);
        if (stolen) {
          return true;
        }
        // 被其他请求抢走了，继续等待
      }

      // 3. 随机退避，避免惊群
      const delay = 50 + Math.random() * 50;
      await sleep(delay);
    }

    // 4. 等待超时，兜底放行（不再加锁）
    return true;
  }

  /**
   * 清空所有锁（用于测试）
   */
  async clear(pattern: string = "*"): Promise<void> {
    // 注意：生产环境谨慎使用
    const redisKey = this.getKey(pattern);
    if (pattern === "*") {
      // 简化的清理实现
      const keys = await this.client.keys(redisKey);
      for (const key of keys) {
        await this.client.del(key);
      }
    }
  }
}
