import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Testing } from "../../core/testing";
import { Cache, CachePlugin } from "./index";

describe("CachePlugin", () => {
  let engine: ReturnType<typeof Testing.createTestEngine>["engine"];
  let Module: ReturnType<typeof Testing.createTestEngine>["Module"];
  let cachePlugin: CachePlugin;

  beforeEach(() => {
    // 每个测试都会创建新的 Factory，使用不同的 key，自动隔离
    cachePlugin = new CachePlugin();
    const testEngine = Testing.createTestEngine({ plugins: [cachePlugin] });
    engine = testEngine.engine;
    Module = testEngine.Module;
  });

  afterEach(async () => {
    // 清理：停止引擎并清空缓存
    if (engine) {
      await engine.stop().catch(() => {});
    }
    await cachePlugin.clear();
  });

  describe("插件配置", () => {
    it("应该有正确的插件名称", () => {
      expect(cachePlugin.name).toBe("cache-plugin");
    });

    it("应该声明Module配置Schema", () => {
      const schema = cachePlugin.getModuleOptionsSchema?.();
      expect(schema).toBeDefined();
      expect(schema?.validate).toBeDefined();
    });

    it("应该校验Module配置", () => {
      const schema = cachePlugin.getModuleOptionsSchema?.();
      if (!schema?.validate) return;

      // 有效的配置
      expect(schema.validate({ cacheDefaultTtl: 5000 })).toBe(true);

      // 无效的配置（TTL为负数）
      const result = schema.validate({ cacheDefaultTtl: -1 });
      expect(result).not.toBe(true);
      expect(typeof result).toBe("string");
    });
  });

  describe("缓存功能", () => {
    it("应该能够缓存方法结果", async () => {
      let callCount = 0;

      @Module("test-module")
      class TestService {
        @Cache({ ttl: 1000 })
        async getData(id: number) {
          callCount++;
          return { id, value: `data-${id}` };
        }
      }

      // 使用 engine.handler 测试（不依赖 Hono，更符合 RPC 调用语义）
      const getDataHandler = engine.handler(TestService, "getData");

      // 第一次调用，应该执行原始方法
      const result1 = await getDataHandler(1);
      expect(result1).toEqual({ id: 1, value: "data-1" });
      expect(callCount).toBe(1);

      // 第二次调用，应该从缓存返回
      const result2 = await getDataHandler(1);
      expect(result2).toEqual({ id: 1, value: "data-1" });
      expect(callCount).toBe(1); // 调用次数不变
    });

    it("应该支持自定义 key 函数", async () => {
      @Module("test-module")
      class TestService {
        @Cache({
          ttl: 1000,
          key: (id: number) => ({ id }), // key 函数返回对象
        })
        async getData(id: number) {
          return { id };
        }
      }

      // 使用 engine.handler 测试
      const getDataHandler = engine.handler(TestService, "getData");
      await getDataHandler(1);

      const stats = await cachePlugin.getStats();
      // 缓存键格式：模块名:方法名:hash
      expect(stats.entries.length).toBeGreaterThan(0);
      const cacheKey = stats.entries[0].key;
      expect(cacheKey).toMatch(/^test-module:getData:[a-f0-9]{64}$/);
    });

    it("应该使用模块名和方法名作为缓存键前缀", async () => {
      @Module("user-service")
      class UserService {
        @Cache({ ttl: 1000 })
        async getUser(id: number) {
          return { id, name: "User" };
        }
      }

      @Module("order-service")
      class OrderService {
        @Cache({ ttl: 1000 })
        async getOrder(id: number) {
          return { id, total: 100 };
        }
      }

      // 使用 engine.handler 测试
      const getUserHandler = engine.handler(UserService, "getUser");
      const getOrderHandler = engine.handler(OrderService, "getOrder");

      await getUserHandler(1);
      await getOrderHandler(1);

      const stats = await cachePlugin.getStats();
      expect(stats.entries.length).toBe(2);

      // 验证缓存键前缀
      const userKey = stats.entries.find((e) => e.key.startsWith("user-service:getUser:"));
      const orderKey = stats.entries.find((e) => e.key.startsWith("order-service:getOrder:"));

      expect(userKey).toBeDefined();
      expect(orderKey).toBeDefined();
      expect(userKey?.key).not.toBe(orderKey?.key); // 不同模块的相同参数应该有不同的键

    });

    it("应该对 key 函数的返回值进行 ejson 序列化和 hash", async () => {
      @Module("test-module")
      class TestService {
        @Cache({
          ttl: 1000,
          key: (id: number, name: string) => ({
            id,
            name,
            date: new Date("2024-01-01"),
            map: new Map([["key", "value"]]),
          }),
        })
        async getData(id: number, name: string) {
          return { id, name };
        }
      }

      // 使用 engine.handler 测试
      const getDataHandler = engine.handler(TestService, "getData");

      // 相同参数应该使用相同的缓存键
      await getDataHandler(1, "test");
      await getDataHandler(1, "test");

      const stats = await cachePlugin.getStats();
      expect(stats.entries.length).toBe(1); // 应该只有一条缓存

      // 不同参数应该使用不同的缓存键
      await getDataHandler(2, "test");
      expect((await cachePlugin.getStats()).entries.length).toBe(2);
    });

    it("应该在不提供 key 函数时使用入参生成缓存键", async () => {
      @Module("test-module")
      class TestService {
        @Cache({ ttl: 1000 })
        async getData(id: number, name: string) {
          return { id, name };
        }
      }

      // 使用 engine.handler 测试
      const getDataHandler = engine.handler(TestService, "getData");
      await getDataHandler(1, "test");

      const stats = await cachePlugin.getStats();
      expect(stats.entries.length).toBe(1);
      const cacheKey = stats.entries[0].key;
      // 缓存键格式：模块名:方法名:hash（hash 基于 args）
      expect(cacheKey).toMatch(/^test-module:getData:[a-f0-9]{64}$/);
    });

    it("应该支持模块级默认TTL", async () => {
      @Module("test-module", {
        cacheDefaultTtl: 2000,
      })
      class TestService {
        @Cache() // 使用模块默认TTL
        async getData() {
          return { value: "data" };
        }
      }

      await engine.start();
      const instance = engine.get(TestService);
      await instance.getData();

      const stats = await cachePlugin.getStats();
      const entry = stats.entries[0];
      if (entry) {
        expect(entry.expiresAt - entry.createdAt).toBeGreaterThanOrEqual(2000);
      } else {
        throw new Error("No cache entry found");
      }

      await engine.stop();
    });
  });

  describe("缓存管理", () => {
    it("应该能够获取缓存统计信息", async () => {
      const stats = await cachePlugin.getStats();
      expect(stats).toHaveProperty("size");
      expect(stats).toHaveProperty("entries");
      expect(Array.isArray(stats.entries)).toBe(true);
    });

    it("应该能够清空所有缓存", async () => {
      await cachePlugin.clear();
      const stats = await cachePlugin.getStats();
      expect(stats.size).toBe(0);
    });

    it("应该能够删除指定的缓存项", async () => {
      @Module("test-module")
      class TestService {
        @Cache({ ttl: 1000 })
        async getData(id: number) {
          return { id };
        }
      }

      // 使用 engine.handler 测试
      const getDataHandler = engine.handler(TestService, "getData");
      await getDataHandler(1);

      const stats = await cachePlugin.getStats();
      const key = stats.entries[0]?.key;

      if (key) {
        const deleted = await cachePlugin.delete(key);
        expect(deleted).toBe(true);
        const newStats = await cachePlugin.getStats();
        expect(newStats.size).toBe(0);
      }
    });
  });
});
