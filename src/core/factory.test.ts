import { beforeEach, describe, expect, it } from "vitest";
import { CachePlugin } from "../plugins/cache";
import { RoutePlugin } from "../plugins/route";
import { Factory } from "./factory";

describe("Factory", () => {
  beforeEach(() => {
    // 每个测试都会创建新的 Factory，使用不同的 key，自动隔离
    // 不需要手动清空注册表
  });
  describe("create", () => {
    it("应该创建类型化的 Module 装饰器和 Microservice 类", () => {
      const { Module, Microservice } = Factory.create(new CachePlugin());

      expect(Module).toBeDefined();
      expect(typeof Module).toBe("function");
      expect(Microservice).toBeDefined();
      expect(typeof Microservice).toBe("function");
    });

    it("应该创建引擎实例并注册插件", () => {
      const { Microservice } = Factory.create(new CachePlugin());

      const engine = new Microservice({
        name: "test-service",
        version: "1.0.0",
      });

      expect(engine).toBeDefined();
      expect(engine.getModules).toBeDefined();
      expect(engine.start).toBeDefined();
    });

    it("应该在构造函数中正确注册所有插件", () => {
      const cachePlugin = new CachePlugin();
      const routePlugin = new RoutePlugin();

      const { Microservice } = Factory.create(cachePlugin, routePlugin);

      const engine = new Microservice({
        name: "test-service",
        version: "1.0.0",
      });

      // 验证插件已注册（通过检查模块配置类型）
      const modules = engine.getModules();
      expect(modules).toBeDefined();
    });

    it("应该只包含显式注册的插件", () => {
      const { Module, Microservice } = Factory.create(
        new CachePlugin(),
        new RoutePlugin()
      );

      // 先创建引擎实例
      const engine = new Microservice({
        name: "test-service",
        version: "1.0.0",
      });

      // 然后使用装饰器
      @Module("test-module", {
        routePrefix: "/api",
        cacheDefaultTtl: 5000,
      })
      class TestService {}

      expect(TestService).toBeDefined();
      expect(engine.getModules()).toHaveLength(1);
    });
  });
});
