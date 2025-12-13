import { describe, expect, it } from "vitest";
import {
  Handler,
  getAllHandlerMetadata,
  getHandlerMetadata,
} from "./decorators";

describe("Handler装饰器", () => {
  describe("Handler装饰器", () => {
    it("应该能够标注方法为Handler", () => {
      class TestService {
        @Handler({ type: "route", options: { method: "GET" } })
        getUser() {}
      }

      // 实例化类以确保装饰器的 addInitializer 执行
      new TestService();

      const metadata = getHandlerMetadata(TestService, "getUser");
      expect(metadata).toHaveLength(1);
      expect(metadata[0].type).toBe("route");
      expect(metadata[0].options.method).toBe("GET");
      expect(metadata[0].methodName).toBe("getUser");
      expect(metadata[0].module).toBe(TestService);
    });

    it("应该支持多应用Handler装饰器", () => {
      class TestService {
        @Handler({ type: "route", options: { method: "GET" } })
        @Handler({ type: "cache", options: { ttl: 60 } })
        @Handler({ type: "rate-limit", options: { limit: 100 } })
        getUser() {}
      }

      // 实例化类以确保装饰器的 addInitializer 执行
      new TestService();

      const metadata = getHandlerMetadata(TestService, "getUser");
      expect(metadata).toHaveLength(3);

      const routeMeta = metadata.find((m) => m.type === "route");
      const cacheMeta = metadata.find((m) => m.type === "cache");
      const rateLimitMeta = metadata.find((m) => m.type === "rate-limit");

      expect(routeMeta).toBeDefined();
      expect(cacheMeta).toBeDefined();
      expect(rateLimitMeta).toBeDefined();
      expect(routeMeta?.options.method).toBe("GET");
      expect(cacheMeta?.options.ttl).toBe(60);
      expect(rateLimitMeta?.options.limit).toBe(100);
    });

    it("应该能够获取所有Handler元数据", () => {
      class TestService {
        @Handler({ type: "route" })
        getUser() {}

        @Handler({ type: "route" })
        createUser() {}

        // 没有装饰器的方法不应该出现
        deleteUser() {}
      }

      // 实例化类以确保装饰器的 addInitializer 执行
      new TestService();

      const allMetadata = getAllHandlerMetadata(TestService);
      expect(allMetadata.size).toBe(2);
      expect(allMetadata.has("getUser")).toBe(true);
      expect(allMetadata.has("createUser")).toBe(true);
      expect(allMetadata.has("deleteUser")).toBe(false);
    });

    it("Handler元数据应该包含完整信息", () => {
      class TestService {
        @Handler({ type: "route", options: { path: "/user" } })
        getUser() {
          return { id: 1 };
        }
      }

      // 实例化类以确保装饰器的 addInitializer 执行
      new TestService();

      const metadata = getHandlerMetadata(TestService, "getUser");
      expect(metadata[0]).toMatchObject({
        type: "route",
        options: { path: "/user" },
        methodName: "getUser",
        module: TestService,
      });
      expect(typeof metadata[0].method).toBe("function");
    });
  });
});
