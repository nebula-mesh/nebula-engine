import { beforeEach, describe, expect, it } from "vitest";
import { MemoryCacheAdapter, RedisCacheAdapter } from "./adapter";
import { CacheItem } from "./types";

describe("CacheAdapter", () => {
  describe("MemoryCacheAdapter", () => {
    let adapter: MemoryCacheAdapter;

    beforeEach(() => {
      adapter = new MemoryCacheAdapter();
    });

    describe("基本操作", () => {
      it("应该能够设置和获取缓存项", async () => {
        const item: CacheItem<string> = {
          value: "test-value",
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        };

        await adapter.set("test-key", item);
        const result = await adapter.get("test-key");

        expect(result).not.toBeNull();
        expect(result?.value).toBe("test-value");
        expect(result?.expiresAt).toBe(item.expiresAt);
        expect(result?.createdAt).toBe(item.createdAt);
      });

      it("应该返回 null 当键不存在时", async () => {
        const result = await adapter.get("non-existent-key");
        expect(result).toBeNull();
      });

      it("应该能够删除缓存项", async () => {
        const item: CacheItem<string> = {
          value: "test-value",
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        };

        await adapter.set("test-key", item);
        const deleted = await adapter.delete("test-key");
        expect(deleted).toBe(true);

        const result = await adapter.get("test-key");
        expect(result).toBeNull();
      });

      it("删除不存在的键应该返回 false", async () => {
        const deleted = await adapter.delete("non-existent-key");
        expect(deleted).toBe(false);
      });

      it("应该能够清空所有缓存", async () => {
        await adapter.set("key1", {
          value: "value1",
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        });
        await adapter.set("key2", {
          value: "value2",
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        });

        await adapter.clear();

        const stats = await adapter.getStats();
        expect(stats.size).toBe(0);
      });
    });

    describe("过期处理", () => {
      it("应该自动删除过期的缓存项", async () => {
        const expiredItem: CacheItem<string> = {
          value: "expired-value",
          expiresAt: Date.now() - 1000, // 已过期
          createdAt: Date.now() - 5000,
        };

        await adapter.set("expired-key", expiredItem);
        const result = await adapter.get("expired-key");

        expect(result).toBeNull();
      });

      it("应该保留未过期的缓存项", async () => {
        const validItem: CacheItem<string> = {
          value: "valid-value",
          expiresAt: Date.now() + 10000, // 10秒后过期
          createdAt: Date.now(),
        };

        await adapter.set("valid-key", validItem);
        const result = await adapter.get("valid-key");

        expect(result).not.toBeNull();
        expect(result?.value).toBe("valid-value");
      });
    });

    describe("键管理", () => {
      it("应该能够获取所有缓存键", async () => {
        await adapter.set("key1", {
          value: "value1",
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        });
        await adapter.set("key2", {
          value: "value2",
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        });

        const keys = await adapter.keys();
        expect(keys).toContain("key1");
        expect(keys).toContain("key2");
        expect(keys.length).toBe(2);
      });

      it("清空后应该返回空数组", async () => {
        await adapter.set("key1", {
          value: "value1",
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        });

        await adapter.clear();
        const keys = await adapter.keys();
        expect(keys).toEqual([]);
      });
    });

    describe("统计信息", () => {
      it("应该能够获取缓存统计信息", async () => {
        const now = Date.now();
        await adapter.set("key1", {
          value: "value1",
          expiresAt: now + 10000,
          createdAt: now,
        });
        await adapter.set("key2", {
          value: "value2",
          expiresAt: now + 20000,
          createdAt: now + 1000,
        });

        const stats = await adapter.getStats();
        expect(stats.size).toBe(2);
        expect(stats.entries).toHaveLength(2);
        expect(stats.entries[0]).toHaveProperty("key");
        expect(stats.entries[0]).toHaveProperty("expiresAt");
        expect(stats.entries[0]).toHaveProperty("createdAt");
      });

      it("应该排除过期的项", async () => {
        await adapter.set("valid-key", {
          value: "valid",
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        });
        await adapter.set("expired-key", {
          value: "expired",
          expiresAt: Date.now() - 1000,
          createdAt: Date.now() - 5000,
        });

        const stats = await adapter.getStats();
        // 过期项在 get 时会被删除，所以统计中不包含
        expect(stats.size).toBe(1);
        expect(stats.entries[0].key).toBe("valid-key");
      });
    });

    describe("类型支持", () => {
      it("应该支持不同的数据类型", async () => {
        // 字符串
        await adapter.set("string-key", {
          value: "string-value",
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        });

        // 数字
        await adapter.set("number-key", {
          value: 123,
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        });

        // 对象
        await adapter.set("object-key", {
          value: { name: "test", age: 25 },
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        });

        // 数组
        await adapter.set("array-key", {
          value: [1, 2, 3],
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        });

        const stringResult = await adapter.get<string>("string-key");
        expect(stringResult?.value).toBe("string-value");

        const numberResult = await adapter.get<number>("number-key");
        expect(numberResult?.value).toBe(123);

        const objectResult = await adapter.get<{ name: string; age: number }>(
          "object-key"
        );
        expect(objectResult?.value).toEqual({ name: "test", age: 25 });

        const arrayResult = await adapter.get<number[]>("array-key");
        expect(arrayResult?.value).toEqual([1, 2, 3]);
      });
    });

    describe("定期清理", () => {
      it("应该能够批量清理过期项", async () => {
        const now = Date.now();

        // 添加一些过期项
        await adapter.set("expired1", {
          value: "expired1",
          expiresAt: now - 1000,
          createdAt: now - 5000,
        });
        await adapter.set("expired2", {
          value: "expired2",
          expiresAt: now - 500,
          createdAt: now - 3000,
        });

        // 添加一些有效项
        await adapter.set("valid1", {
          value: "valid1",
          expiresAt: now + 10000,
          createdAt: now,
        });
        await adapter.set("valid2", {
          value: "valid2",
          expiresAt: now + 20000,
          createdAt: now,
        });

        // 执行清理
        const cleaned = await adapter.cleanupExpired!();
        expect(cleaned).toBe(2);

        // 验证过期项已被删除
        const expired1 = await adapter.get("expired1");
        const expired2 = await adapter.get("expired2");
        expect(expired1).toBeNull();
        expect(expired2).toBeNull();

        // 验证有效项仍然存在
        const valid1 = await adapter.get("valid1");
        const valid2 = await adapter.get("valid2");
        expect(valid1).not.toBeNull();
        expect(valid2).not.toBeNull();

        // 验证统计信息
        const stats = await adapter.getStats();
        expect(stats.size).toBe(2);
      });

      it("清理时如果没有过期项应该返回 0", async () => {
        await adapter.set("valid1", {
          value: "valid1",
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        });

        const cleaned = await adapter.cleanupExpired!();
        expect(cleaned).toBe(0);

        const stats = await adapter.getStats();
        expect(stats.size).toBe(1);
      });
    });
  });

  describe("RedisCacheAdapter", () => {
    let adapter: RedisCacheAdapter;
    let mockClient: {
      storage: Map<string, { value: string; expiresAt?: number }>;
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

    beforeEach(() => {
      mockClient = {
        storage: new Map(),
        async get(key: string): Promise<string | null> {
          const item = this.storage.get(key);
          if (!item) {
            return null;
          }
          // 检查是否过期
          if (item.expiresAt && item.expiresAt <= Date.now()) {
            this.storage.delete(key);
            return null;
          }
          return item.value;
        },
        async set(
          key: string,
          value: string,
          expiryMode?: string,
          time?: number
        ): Promise<string | null> {
          const expiresAt =
            expiryMode === "EX" && time ? Date.now() + time * 1000 : undefined;
          this.storage.set(key, { value, expiresAt });
          return "OK";
        },
        async del(key: string): Promise<number> {
          return this.storage.delete(key) ? 1 : 0;
        },
        async keys(pattern: string): Promise<string[]> {
          const prefix = pattern.replace("*", "");
          return Array.from(this.storage.keys()).filter((key) =>
            key.startsWith(prefix)
          );
        },
      };

      adapter = new RedisCacheAdapter({ client: mockClient });
    });

    describe("基本操作", () => {
      it("应该能够设置和获取缓存项", async () => {
        const item: CacheItem<string> = {
          value: "test-value",
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        };

        await adapter.set("test-key", item);
        const result = await adapter.get("test-key");

        expect(result).not.toBeNull();
        expect(result?.value).toBe("test-value");
        expect(result?.expiresAt).toBe(item.expiresAt);
        expect(result?.createdAt).toBe(item.createdAt);
      });

      it("应该返回 null 当键不存在时", async () => {
        const result = await adapter.get("non-existent-key");
        expect(result).toBeNull();
      });

      it("应该能够删除缓存项", async () => {
        const item: CacheItem<string> = {
          value: "test-value",
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        };

        await adapter.set("test-key", item);
        const deleted = await adapter.delete("test-key");
        expect(deleted).toBe(true);

        const result = await adapter.get("test-key");
        expect(result).toBeNull();
      });

      it("删除不存在的键应该返回 false", async () => {
        const deleted = await adapter.delete("non-existent-key");
        expect(deleted).toBe(false);
      });

      it("应该能够清空所有缓存", async () => {
        await adapter.set("key1", {
          value: "value1",
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        });
        await adapter.set("key2", {
          value: "value2",
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        });

        await adapter.clear();

        const stats = await adapter.getStats();
        expect(stats.size).toBe(0);
      });
    });

    describe("键前缀", () => {
      it("应该使用默认前缀 'cache:'", async () => {
        const item: CacheItem<string> = {
          value: "test-value",
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        };

        await adapter.set("test-key", item);

        // 检查 Redis 存储中是否有带前缀的键
        const keys = await mockClient.keys("cache:*");
        expect(keys).toContain("cache:test-key");
      });

      it("应该支持自定义前缀", async () => {
        const customAdapter = new RedisCacheAdapter({
          client: mockClient,
          keyPrefix: "myapp:cache:",
        });

        const item: CacheItem<string> = {
          value: "test-value",
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        };

        await customAdapter.set("test-key", item);

        const keys = await mockClient.keys("myapp:cache:*");
        expect(keys).toContain("myapp:cache:test-key");
      });

      it("keys() 应该返回不带前缀的键", async () => {
        await adapter.set("key1", {
          value: "value1",
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        });

        const keys = await adapter.keys();
        expect(keys).toContain("key1");
        expect(keys.every((key) => !key.startsWith("cache:"))).toBe(true);
      });
    });

    describe("过期处理", () => {
      it("应该自动删除过期的缓存项", async () => {
        const expiredItem: CacheItem<string> = {
          value: "expired-value",
          expiresAt: Date.now() - 1000, // 已过期
          createdAt: Date.now() - 5000,
        };

        await adapter.set("expired-key", expiredItem);
        const result = await adapter.get("expired-key");

        expect(result).toBeNull();
      });

      it("应该保留未过期的缓存项", async () => {
        const validItem: CacheItem<string> = {
          value: "valid-value",
          expiresAt: Date.now() + 10000, // 10秒后过期
          createdAt: Date.now(),
        };

        await adapter.set("valid-key", validItem);
        const result = await adapter.get("valid-key");

        expect(result).not.toBeNull();
        expect(result?.value).toBe("valid-value");
      });

      it("应该使用 Redis 的过期时间", async () => {
        const item: CacheItem<string> = {
          value: "test-value",
          expiresAt: Date.now() + 5000, // 5秒后过期
          createdAt: Date.now(),
        };

        await adapter.set("test-key", item);

        // 验证 Redis 存储中的过期时间设置
        const redisKey = "cache:test-key";
        const stored = mockClient.storage.get(redisKey);
        expect(stored).toBeDefined();
        expect(stored?.expiresAt).toBeGreaterThan(Date.now());
      });
    });

    describe("错误处理", () => {
      it("应该处理 JSON 解析错误", async () => {
        // 设置无效的 JSON 数据
        await mockClient.set("cache:invalid-key", "invalid-json");

        const result = await adapter.get("invalid-key");
        expect(result).toBeNull();

        // 验证无效数据已被删除
        const exists = mockClient.storage.has("cache:invalid-key");
        expect(exists).toBe(false);
      });

      it("应该处理 Redis 返回 null 的情况", async () => {
        const result = await adapter.get("non-existent-key");
        expect(result).toBeNull();
      });
    });

    describe("统计信息", () => {
      it("应该能够获取缓存统计信息", async () => {
        const now = Date.now();
        await adapter.set("key1", {
          value: "value1",
          expiresAt: now + 10000,
          createdAt: now,
        });
        await adapter.set("key2", {
          value: "value2",
          expiresAt: now + 20000,
          createdAt: now + 1000,
        });

        const stats = await adapter.getStats();
        expect(stats.size).toBe(2);
        expect(stats.entries).toHaveLength(2);
        expect(stats.entries[0]).toHaveProperty("key");
        expect(stats.entries[0]).toHaveProperty("expiresAt");
        expect(stats.entries[0]).toHaveProperty("createdAt");
      });

      it("应该排除过期的项", async () => {
        await adapter.set("valid-key", {
          value: "valid",
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        });
        await adapter.set("expired-key", {
          value: "expired",
          expiresAt: Date.now() - 1000,
          createdAt: Date.now() - 5000,
        });

        const stats = await adapter.getStats();
        // 过期项在 get 时会被删除，所以统计中不包含
        expect(stats.size).toBe(1);
        expect(stats.entries[0].key).toBe("valid-key");
      });
    });

    describe("类型支持", () => {
      it("应该支持不同的数据类型", async () => {
        // 字符串
        await adapter.set("string-key", {
          value: "string-value",
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        });

        // 数字
        await adapter.set("number-key", {
          value: 123,
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        });

        // 对象
        await adapter.set("object-key", {
          value: { name: "test", age: 25 },
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        });

        // 数组
        await adapter.set("array-key", {
          value: [1, 2, 3],
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        });

        const stringResult = await adapter.get<string>("string-key");
        expect(stringResult?.value).toBe("string-value");

        const numberResult = await adapter.get<number>("number-key");
        expect(numberResult?.value).toBe(123);

        const objectResult = await adapter.get<{ name: string; age: number }>(
          "object-key"
        );
        expect(objectResult?.value).toEqual({ name: "test", age: 25 });

        const arrayResult = await adapter.get<number[]>("array-key");
        expect(arrayResult?.value).toEqual([1, 2, 3]);
      });
    });

    describe("批量操作", () => {
      it("应该能够批量清空缓存", async () => {
        await adapter.set("key1", {
          value: "value1",
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        });
        await adapter.set("key2", {
          value: "value2",
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        });
        await adapter.set("key3", {
          value: "value3",
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        });

        await adapter.clear();

        const stats = await adapter.getStats();
        expect(stats.size).toBe(0);
      });
    });

    describe("定期清理", () => {
      it("应该能够批量清理过期项", async () => {
        const now = Date.now();

        // 添加一些过期项
        await adapter.set("expired1", {
          value: "expired1",
          expiresAt: now - 1000,
          createdAt: now - 5000,
        });
        await adapter.set("expired2", {
          value: "expired2",
          expiresAt: now - 500,
          createdAt: now - 3000,
        });

        // 添加一些有效项
        await adapter.set("valid1", {
          value: "valid1",
          expiresAt: now + 10000,
          createdAt: now,
        });
        await adapter.set("valid2", {
          value: "valid2",
          expiresAt: now + 20000,
          createdAt: now,
        });

        // 执行清理
        const cleaned = await adapter.cleanupExpired!();
        expect(cleaned).toBe(2);

        // 验证过期项已被删除
        const expired1 = await adapter.get("expired1");
        const expired2 = await adapter.get("expired2");
        expect(expired1).toBeNull();
        expect(expired2).toBeNull();

        // 验证有效项仍然存在
        const valid1 = await adapter.get("valid1");
        const valid2 = await adapter.get("valid2");
        expect(valid1).not.toBeNull();
        expect(valid2).not.toBeNull();

        // 验证统计信息
        const stats = await adapter.getStats();
        expect(stats.size).toBe(2);
      });

      it("清理时如果没有过期项应该返回 0", async () => {
        await adapter.set("valid1", {
          value: "valid1",
          expiresAt: Date.now() + 10000,
          createdAt: Date.now(),
        });

        const cleaned = await adapter.cleanupExpired!();
        expect(cleaned).toBe(0);

        const stats = await adapter.getStats();
        expect(stats.size).toBe(1);
      });
    });
  });
});
