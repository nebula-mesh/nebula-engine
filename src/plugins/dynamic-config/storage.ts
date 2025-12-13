import * as ejson from "ejson";

import logger from "../../core/logger";
import type { ConfigMetadata, ConfigStorage, Etcd3 } from "./types";

/**
 * Etcd 配置存储实现
 *
 * 负责与 etcd 交互，提供配置的读取、写入、删除、监听功能
 * 内置缓存机制，减少 etcd 访问次数
 */
export class EtcdConfigStorage implements ConfigStorage {
  private etcdClient: Etcd3;
  private prefix: string;
  private watchers: Map<string, Set<(newValue: any, oldValue: any) => void>> =
    new Map();
  private cache: Map<string, any> = new Map();

  constructor(etcdClient: Etcd3, prefix: string = "/config") {
    this.etcdClient = etcdClient;
    this.prefix = prefix;
  }

  /**
   * 构建完整的 etcd 键
   */
  private buildKey(key: string): string {
    return `${this.prefix}/${key}`;
  }

  /**
   * 获取配置
   */
  async get(key: string): Promise<any> {
    try {
      const fullKey = this.buildKey(key);
      const value = await this.etcdClient.get(fullKey).string();

      if (value === null || value === undefined) {
        logger.warn(`get config from etcd: ${fullKey} - not found`);
        return null;
      }

      if (value.trim() === "") {
        return null;
      }

      const parsed = ejson.parse(value);

      // 更新缓存
      this.cache.set(key, parsed);

      return parsed;
    } catch (error) {
      logger.error(`Failed to get config from etcd: ${key}`, error);
      // 返回缓存值
      return this.cache.get(key) || null;
    }
  }

  /**
   * 同步获取缓存的配置（不访问 etcd）
   * 用于 configProxy 的同步访问
   */
  getCached(key: string): any {
    return this.cache.get(key);
  }

  /**
   * 设置配置
   */
  async set(
    key: string,
    value: any,
    metadata?: ConfigMetadata
  ): Promise<void> {
    try {
      const fullKey = this.buildKey(key);
      const serialized = ejson.stringify(value);

      await this.etcdClient.put(fullKey).value(serialized);

      // 更新缓存
      this.cache.set(key, value);
    } catch (error) {
      logger.error(`Failed to set config in etcd: ${key}`, error);
      throw error;
    }
  }

  /**
   * 删除配置
   */
  async delete(key: string): Promise<void> {
    try {
      const fullKey = this.buildKey(key);
      await this.etcdClient.delete().key(fullKey);

      // 清除缓存
      this.cache.delete(key);
    } catch (error) {
      logger.error(`Failed to delete config from etcd: ${key}`, error);
      throw error;
    }
  }

  /**
   * 获取所有配置
   */
  async getAll(prefix?: string): Promise<Map<string, any>> {
    try {
      const searchPrefix = prefix
        ? this.buildKey(prefix)
        : this.buildKey("");
      const response = await this.etcdClient.getAll().prefix(searchPrefix).strings();

      const result = new Map<string, any>();

      for (const key in response) {
        const cleanKey = key.replace(this.prefix + "/", "");
        const value = ejson.parse(response[key]);
        result.set(cleanKey, value);

        // 更新缓存
        this.cache.set(cleanKey, value);
      }

      return result;
    } catch (error) {
      logger.error(`Failed to get all configs from etcd`, error);
      return new Map();
    }
  }

  /**
   * 监听配置变化
   */
  watch(
    key: string,
    callback: (newValue: any, oldValue: any) => void
  ): () => void {
    const fullKey = this.buildKey(key);

    // 添加回调到监听器集合
    if (!this.watchers.has(key)) {
      this.watchers.set(key, new Set());

      // 创建 etcd watcher
      this.etcdClient
        .watch()
        .key(fullKey)
        .create()
        .then((watcher) => {
          watcher.on("put", (kv) => {
            try {
              const newValue = ejson.parse(kv.value.toString());
              const oldValue = this.cache.get(key);

              // 更新缓存
              this.cache.set(key, newValue);

              // 触发所有回调
              const callbacks = this.watchers.get(key);
              if (callbacks) {
                callbacks.forEach((cb) => {
                  try {
                    cb(newValue, oldValue);
                  } catch (error) {
                    logger.error(
                      `Config watch callback error for key: ${key}`,
                      error
                    );
                  }
                });
              }
            } catch (error) {
              logger.error(`Failed to parse config value for key: ${key}`, error);
            }
          });

          watcher.on("delete", () => {
            const oldValue = this.cache.get(key);
            this.cache.delete(key);

            // 触发所有回调（newValue 为 null）
            const callbacks = this.watchers.get(key);
            if (callbacks) {
              callbacks.forEach((cb) => {
                try {
                  cb(null, oldValue);
                } catch (error) {
                  logger.error(
                    `Config watch callback error for key: ${key}`,
                    error
                  );
                }
              });
            }
          });
        })
        .catch((error) => {
          logger.error(`Failed to create etcd watcher for key: ${key}`, error);
        });
    }

    this.watchers.get(key)!.add(callback);

    // 返回取消监听的函数
    return () => {
      const callbacks = this.watchers.get(key);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.watchers.delete(key);
        }
      }
    };
  }

  /**
   * 清理资源
   */
  async destroy(): Promise<void> {
    this.watchers.clear();
    this.cache.clear();
  }
}

/**
 * 内存配置存储实现
 *
 * 用于测试和本地开发环境，不依赖 etcd
 * 配置存储在内存中，服务重启后会丢失
 */
export class MemoryConfigStorage implements ConfigStorage {
  private storage: Map<string, any> = new Map();
  private watchers: Map<string, Set<(newValue: any, oldValue: any) => void>> =
    new Map();

  async get(key: string): Promise<any> {
    return this.storage.get(key) || null;
  }

  getCached(key: string): any {
    return this.storage.get(key);
  }

  async set(
    key: string,
    value: any,
    metadata?: ConfigMetadata
  ): Promise<void> {
    const oldValue = this.storage.get(key);
    this.storage.set(key, value);

    // 触发监听器
    const callbacks = this.watchers.get(key);
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb(value, oldValue);
        } catch (error) {
          logger.error(`Config watch callback error for key: ${key}`, error);
        }
      });
    }
  }

  async delete(key: string): Promise<void> {
    const oldValue = this.storage.get(key);
    this.storage.delete(key);

    // 触发监听器
    const callbacks = this.watchers.get(key);
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb(null, oldValue);
        } catch (error) {
          logger.error(`Config watch callback error for key: ${key}`, error);
        }
      });
    }
  }

  async getAll(prefix?: string): Promise<Map<string, any>> {
    if (!prefix) {
      return new Map(this.storage);
    }

    const result = new Map<string, any>();
    for (const [key, value] of this.storage.entries()) {
      if (key.startsWith(prefix)) {
        result.set(key, value);
      }
    }
    return result;
  }

  watch(
    key: string,
    callback: (newValue: any, oldValue: any) => void
  ): () => void {
    if (!this.watchers.has(key)) {
      this.watchers.set(key, new Set());
    }

    this.watchers.get(key)!.add(callback);

    // 返回取消监听的函数
    return () => {
      const callbacks = this.watchers.get(key);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.watchers.delete(key);
        }
      }
    };
  }

  async destroy(): Promise<void> {
    this.storage.clear();
    this.watchers.clear();
  }
}
