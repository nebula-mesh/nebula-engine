/**
 * Cache Adapter 接口
 * 定义缓存存储的抽象接口，支持不同的存储后端
 */

import { CacheItem } from "./types";

/**
 * 缓存适配器接口
 */
export interface CacheAdapter {
  /**
   * 获取缓存项
   * @param key 缓存键
   * @returns 缓存项，如果不存在或已过期则返回 null
   */
  get<T = any>(key: string): Promise<CacheItem<T> | null>;

  /**
   * 设置缓存项
   * @param key 缓存键
   * @param item 缓存项
   */
  set<T = any>(key: string, item: CacheItem<T>): Promise<void>;

  /**
   * 删除缓存项
   * @param key 缓存键
   * @returns 是否删除成功
   */
  delete(key: string): Promise<boolean>;

  /**
   * 清空所有缓存
   */
  clear(): Promise<void>;

  /**
   * 获取所有缓存键（用于统计）
   * @returns 缓存键数组（不包含过期项）
   */
  keys(): Promise<string[]>;

  /**
   * 清理所有过期项（高效批量清理）
   * @returns 清理的过期项数量
   */
  cleanupExpired?(): Promise<number>;

  /**
   * 获取缓存统计信息
   */
  getStats(): Promise<{
    size: number;
    entries: Array<{ key: string; expiresAt: number; createdAt: number }>;
  }>;
}

/**
 * 内存缓存适配器
 * 使用 Map 存储，适合单进程应用
 *
 * 注意：过期项会在以下情况被自动清理：
 * 1. get() 时检查并删除过期项
 * 2. keys() 和 getStats() 会过滤过期项
 * 3. 建议通过 CachePlugin 的定期清理机制主动清理过期项
 */
export class MemoryCacheAdapter implements CacheAdapter {
  private cache: Map<string, CacheItem> = new Map();

  async get<T = any>(key: string): Promise<CacheItem<T> | null> {
    const item = this.cache.get(key);
    if (!item) {
      return null;
    }

    // 检查是否过期，过期则删除
    if (item.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return item as CacheItem<T>;
  }

  async set<T = any>(key: string, item: CacheItem<T>): Promise<void> {
    this.cache.set(key, item);
  }

  async delete(key: string): Promise<boolean> {
    return this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async keys(): Promise<string[]> {
    // 过滤过期项，避免返回无效键
    const now = Date.now();
    return Array.from(this.cache.entries())
      .filter(([_, item]) => item.expiresAt > now)
      .map(([key]) => key);
  }

  /**
   * 清理所有过期项（高效批量清理）
   * 这个方法比通过 keys() + get() + delete() 更高效
   */
  async cleanupExpired(): Promise<number> {
    const now = Date.now();
    let cleaned = 0;

    // 直接遍历 Map 并删除过期项
    for (const [key, item] of this.cache.entries()) {
      if (item.expiresAt <= now) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  async getStats(): Promise<{
    size: number;
    entries: Array<{ key: string; expiresAt: number; createdAt: number }>;
  }> {
    const now = Date.now();
    const validEntries = Array.from(this.cache.entries())
      .filter(([_, item]) => item.expiresAt > now)
      .map(([key, item]) => ({
        key,
        expiresAt: item.expiresAt,
        createdAt: item.createdAt,
      }));

    return {
      size: validEntries.length,
      entries: validEntries,
    };
  }
}

/**
 * Redis 缓存适配器配置
 */
export interface RedisCacheAdapterOptions {
  /**
   * Redis 客户端实例（需要实现基本的 get/set/del/keys 方法）
   * 可以是 ioredis、node-redis 等
   */
  client: {
    get(key: string): Promise<string | null>;
    set(
      key: string,
      value: string,
      expiryMode?: string,
      time?: number
    ): Promise<string | null>;
    del(key: string): Promise<number>;
    keys(pattern: string): Promise<string[]>;
  };

  /**
   * 键前缀，用于区分不同应用的缓存
   * 默认：'cache:'
   */
  keyPrefix?: string;
}

/**
 * Redis 缓存适配器
 * 使用 Redis 作为存储后端，适合分布式应用
 *
 * 注意：Redis 本身支持 TTL（Time To Live），过期键会自动删除，
 * 因此不需要手动清理过期项。当使用 SET key value EX seconds 时，
 * Redis 会在过期后自动删除键。
 */
export class RedisCacheAdapter implements CacheAdapter {
  private client: RedisCacheAdapterOptions["client"];
  private keyPrefix: string;

  constructor(options: RedisCacheAdapterOptions) {
    this.client = options.client;
    this.keyPrefix = options.keyPrefix || "cache:";
  }

  private getKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async get<T = any>(key: string): Promise<CacheItem<T> | null> {
    const redisKey = this.getKey(key);
    const data = await this.client.get(redisKey);

    // Redis 会自动删除过期键，如果键已过期，get() 会返回 null
    if (!data) {
      return null;
    }

    try {
      const item: CacheItem<T> = JSON.parse(data);

      // 双重检查：虽然 Redis 会自动删除过期键，但为了兼容性
      // （某些 Redis 客户端或测试环境可能不会立即删除），
      // 仍然检查 expiresAt。在真实 Redis 环境中，这个检查通常是多余的。
      if (item.expiresAt <= Date.now()) {
        await this.delete(key);
        return null;
      }

      return item;
    } catch (error) {
      // 解析失败，删除无效数据
      await this.delete(key);
      return null;
    }
  }

  async set<T = any>(key: string, item: CacheItem<T>): Promise<void> {
    const redisKey = this.getKey(key);
    const data = JSON.stringify(item);

    // 计算 TTL（秒）
    const ttl = Math.max(0, Math.floor((item.expiresAt - Date.now()) / 1000));

    // 使用 SET 命令的 EX 选项设置过期时间
    await this.client.set(redisKey, data, "EX", ttl);
  }

  async delete(key: string): Promise<boolean> {
    const redisKey = this.getKey(key);
    const result = await this.client.del(redisKey);
    return result > 0;
  }

  async clear(): Promise<void> {
    const pattern = `${this.keyPrefix}*`;
    const keys = await this.client.keys(pattern);

    if (keys.length > 0) {
      // 批量删除（注意：这里假设 client 支持批量删除）
      // 如果不支持，可以逐个删除
      await Promise.all(keys.map((key) => this.client.del(key)));
    }
  }

  async keys(): Promise<string[]> {
    const pattern = `${this.keyPrefix}*`;
    const redisKeys = await this.client.keys(pattern);

    // 移除前缀
    return redisKeys.map((key) => key.replace(this.keyPrefix, ""));
  }

  /**
   * 清理所有过期项
   *
   * 注意：Redis 本身支持自动过期（通过 SET key value EX seconds），
   * 过期键会被 Redis 自动删除。但在某些情况下（如测试环境、某些 Redis 客户端），
   * 可能需要手动清理。此方法会检查并清理：
   * 1. 已过期但尚未被 Redis 删除的键（双重保险）
   * 2. JSON 解析失败的数据
   */
  async cleanupExpired(): Promise<number> {
    const pattern = `${this.keyPrefix}*`;
    const redisKeys = await this.client.keys(pattern);
    let cleaned = 0;

    // 检查并清理过期项和无效数据
    for (const redisKey of redisKeys) {
      const data = await this.client.get(redisKey);
      if (!data) {
        // 已被 Redis 自动过期删除，跳过
        continue;
      }

      try {
        const item: CacheItem = JSON.parse(data);
        // 检查是否过期（双重保险，虽然 Redis 应该已经删除了）
        if (item.expiresAt <= Date.now()) {
          await this.client.del(redisKey);
          cleaned++;
        }
      } catch {
        // JSON 解析失败，删除无效数据
        await this.client.del(redisKey);
        cleaned++;
      }
    }

    return cleaned;
  }

  async getStats(): Promise<{
    size: number;
    entries: Array<{ key: string; expiresAt: number; createdAt: number }>;
  }> {
    const allKeys = await this.keys();
    const entries: Array<{
      key: string;
      expiresAt: number;
      createdAt: number;
    }> = [];

    // 获取所有缓存项的元数据
    for (const key of allKeys) {
      const item = await this.get(key);
      if (item) {
        entries.push({
          key,
          expiresAt: item.expiresAt,
          createdAt: item.createdAt,
        });
      }
    }

    return {
      size: entries.length,
      entries,
    };
  }
}
