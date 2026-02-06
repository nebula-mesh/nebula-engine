import { describe, expect, it } from "vitest";
import {
  createClassDecorator,
  createMethodDecorator,
  getAllMethodMetadata,
  getClassMetadata,
  getClassesByKey,
  getKeysByClass,
  getMethodMetadata,
  hasClassMetadata,
  hasMethodMetadata,
} from "./metadata";

describe("通用元数据工具库", () => {
  describe("类装饰器", () => {
    it("应该能够创建和使用类装饰器", () => {
      const Module = createClassDecorator();

      @Module({ name: "test-module", version: "1.0.0" })
      class TestService {}

      const metadata = getClassMetadata(TestService);
      expect(metadata.name).toBe("test-module");
      expect(metadata.version).toBe("1.0.0");
    });

    it("应该支持合并多个装饰器的元数据", () => {
      const Module = createClassDecorator();
      const Config = createClassDecorator();

      @Module({ name: "test" })
      @Config({ env: "production" })
      class TestService {}

      const metadata = getClassMetadata(TestService);
      expect(metadata.name).toBe("test");
      expect(metadata.env).toBe("production");
    });

    it("应该能够检查类是否有元数据", () => {
      const Module = createClassDecorator();

      @Module({ name: "test" })
      class TestService {}

      class EmptyService {}

      expect(hasClassMetadata(TestService)).toBe(true);
      expect(hasClassMetadata(EmptyService)).toBe(false);
    });

    it("应该支持自定义元数据键", () => {
      const CUSTOM_KEY = Symbol.for("custom-key");
      const CustomDecorator = createClassDecorator(CUSTOM_KEY);

      @CustomDecorator({ custom: "value" })
      class TestService {}

      const metadata = getClassMetadata(TestService, CUSTOM_KEY);
      expect(metadata.custom).toBe("value");
    });
  });

  describe("双向访问功能", () => {
    it("应该能够通过 key 获取所有被装饰的类", () => {
      // 使用唯一的 key 避免测试之间的干扰
      const uniqueKey = Symbol("test-key-1");
      const Module = createClassDecorator(uniqueKey);

      @Module({ name: "module1" })
      class Module1 {}

      @Module({ name: "module2" })
      class Module2 {}

      // 实例化类以确保 addInitializer 执行
      new Module1();
      new Module2();

      const classes = getClassesByKey(uniqueKey);
      expect(classes.size).toBe(2);
      expect(classes.has(Module1)).toBe(true);
      expect(classes.has(Module2)).toBe(true);
    });

    it("应该能够通过类获取所有装饰它的 key", () => {
      const Module = createClassDecorator();
      const Config = createClassDecorator(Symbol.for("config"));
      const Cache = createClassDecorator(Symbol.for("cache"));

      const moduleKey = Symbol.for("nebula:classMetadata");
      const configKey = Symbol.for("config");
      const cacheKey = Symbol.for("cache");

      @Module({ name: "test" })
      @Config({ env: "prod" })
      @Cache({ ttl: 60 })
      class TestService {}

      // 实例化类以确保 addInitializer 执行
      new TestService();

      const keys = getKeysByClass(TestService);
      expect(keys.size).toBe(3);
      expect(keys.has(moduleKey)).toBe(true);
      expect(keys.has(configKey)).toBe(true);
      expect(keys.has(cacheKey)).toBe(true);
    });

    it("应该能够通过 key 查找类并获取元数据", () => {
      // 使用唯一的 key 避免测试之间的干扰
      const uniqueKey = Symbol("test-key-2");
      const Module = createClassDecorator(uniqueKey);

      @Module({ name: "user-module" })
      class UserService {}

      @Module({ name: "order-module" })
      class OrderService {}

      // 实例化类以确保 addInitializer 执行
      new UserService();
      new OrderService();

      const classes = getClassesByKey(uniqueKey);
      expect(classes.size).toBe(2);

      // 遍历所有类并获取元数据
      const metadataList: Array<{ name: string }> = [];
      for (const ModuleClass of classes) {
        const metadata = getClassMetadata(ModuleClass, uniqueKey);
        metadataList.push(metadata);
      }

      expect(metadataList).toHaveLength(2);
      const names = metadataList.map((m) => m.name).sort();
      expect(names).toEqual(["order-module", "user-module"]);
    });

    it("应该能够通过类查找所有 key 并获取对应的元数据", () => {
      const Module = createClassDecorator();
      const Config = createClassDecorator(Symbol.for("config"));

      const moduleKey = Symbol.for("nebula:classMetadata");
      const configKey = Symbol.for("config");

      @Module({ name: "test-module" })
      @Config({ env: "production", debug: true })
      class TestService {}

      // 实例化类以确保 addInitializer 执行
      new TestService();

      const keys = getKeysByClass(TestService);
      expect(keys.size).toBe(2);

      // 遍历所有 key 并获取对应的元数据
      const moduleMetadata = getClassMetadata(TestService, moduleKey);
      const configMetadata = getClassMetadata(TestService, configKey);

      expect(moduleMetadata.name).toBe("test-module");
      expect(configMetadata.env).toBe("production");
      expect(configMetadata.debug).toBe(true);
    });

    it("方法装饰器也应该在类上注册 key", () => {
      const Handler = createMethodDecorator();
      const methodKey = Symbol.for("nebula:methodMetadata");

      class TestService {
        @Handler({ type: "route" })
        getUser() {}
      }

      // 实例化类以确保 addInitializer 执行
      new TestService();

      // 方法装饰器也会在类上注册 key
      const keys = getKeysByClass(TestService);
      expect(keys.has(methodKey)).toBe(true);

      // 通过 key 应该能找到这个类
      const classes = getClassesByKey(methodKey);
      expect(classes.has(TestService)).toBe(true);
    });

    it("未装饰的类应该返回空的 key Set", () => {
      class EmptyService {}

      const keys = getKeysByClass(EmptyService);
      expect(keys.size).toBe(0);
    });

    it("不存在的 key 应该返回空的类 Set", () => {
      const nonExistentKey = Symbol.for("non-existent-key");
      const classes = getClassesByKey(nonExistentKey);
      expect(classes.size).toBe(0);
    });

    it("应该支持从实例获取 keys", () => {
      const Module = createClassDecorator();
      const Config = createClassDecorator(Symbol.for("config"));

      const moduleKey = Symbol.for("nebula:classMetadata");
      const configKey = Symbol.for("config");

      @Module({ name: "test" })
      @Config({ env: "prod" })
      class TestService {}

      const instance = new TestService();
      const keys = getKeysByClass(instance);

      expect(keys.size).toBe(2);
      expect(keys.has(moduleKey)).toBe(true);
      expect(keys.has(configKey)).toBe(true);
    });

    it("多个类使用同一个 key 时应该都能被找到", () => {
      // 使用唯一的 key 避免测试之间的干扰
      const uniqueKey = Symbol("test-key-3");
      const Module = createClassDecorator(uniqueKey);

      @Module({ name: "service1" })
      class Service1 {}

      @Module({ name: "service2" })
      class Service2 {}

      @Module({ name: "service3" })
      class Service3 {}

      // 实例化类以确保 addInitializer 执行
      new Service1();
      new Service2();
      new Service3();

      const classes = getClassesByKey(uniqueKey);
      expect(classes.size).toBe(3);
      expect(classes.has(Service1)).toBe(true);
      expect(classes.has(Service2)).toBe(true);
      expect(classes.has(Service3)).toBe(true);
    });
  });

  describe("方法装饰器", () => {
    it("应该能够创建和使用方法装饰器", () => {
      const Handler = createMethodDecorator();

      class TestService {
        @Handler({ type: "route", options: { method: "GET" } })
        getUser() {}
      }

      // 实例化类以确保 addInitializer 执行
      new TestService();

      const metadata = getMethodMetadata(TestService, "getUser");
      expect(metadata).toHaveLength(1);
      expect(metadata[0].type).toBe("route");
      expect(metadata[0].options.method).toBe("GET");
    });

    it("应该支持同一方法应用多个装饰器", () => {
      const Handler = createMethodDecorator();

      class TestService {
        @Handler({ type: "route", options: { method: "GET" } })
        @Handler({ type: "cache", options: { ttl: 60 } })
        @Handler({ type: "auth", options: { required: true } })
        getUser() {}
      }

      // 实例化类以确保 addInitializer 执行
      new TestService();

      const metadata = getMethodMetadata(TestService, "getUser");
      expect(metadata).toHaveLength(3);
      // 装饰器从下往上执行，所以顺序是反的
      expect(metadata[0].type).toBe("auth");
      expect(metadata[1].type).toBe("cache");
      expect(metadata[2].type).toBe("route");
    });

    it("应该能够获取类的所有方法元数据", () => {
      const Handler = createMethodDecorator();

      class TestService {
        @Handler({ type: "route" })
        getUser() {}

        @Handler({ type: "route" })
        createUser() {}

        // 没有装饰器的方法不应该出现在元数据中
        deleteUser() {}
      }

      // 实例化类以确保 addInitializer 执行
      new TestService();

      const allMetadata = getAllMethodMetadata(TestService);
      expect(allMetadata.size).toBe(2);
      expect(allMetadata.has("getUser")).toBe(true);
      expect(allMetadata.has("createUser")).toBe(true);
      expect(allMetadata.has("deleteUser")).toBe(false);
    });

    it("应该能够检查方法是否有元数据", () => {
      const Handler = createMethodDecorator();

      class TestService {
        @Handler({ type: "route" })
        getUser() {}

        deleteUser() {}
      }

      // 实例化类以确保 addInitializer 执行
      new TestService();

      expect(hasMethodMetadata(TestService, "getUser")).toBe(true);
      expect(hasMethodMetadata(TestService, "deleteUser")).toBe(false);
    });

    it("应该支持自定义元数据键", () => {
      const CUSTOM_KEY = Symbol.for("custom-handler-key");
      const CustomHandler = createMethodDecorator(CUSTOM_KEY);

      class TestService {
        @CustomHandler({ type: "custom", options: { value: 123 } })
        method() {}
      }

      // 实例化类以确保 addInitializer 执行
      new TestService();

      const metadata = getMethodMetadata(TestService, "method", CUSTOM_KEY);
      expect(metadata[0].type).toBe("custom");
      expect(metadata[0].options.value).toBe(123);
    });
  });

  describe("实例化后的元数据访问", () => {
    it("应该能够从实例访问类元数据", () => {
      const Module = createClassDecorator();

      @Module({ name: "test-module" })
      class TestService {}

      const instance = new TestService();
      const metadata = getClassMetadata(instance);
      expect(metadata.name).toBe("test-module");
    });

    it("应该能够从实例访问方法元数据", () => {
      const Handler = createMethodDecorator();

      class TestService {
        @Handler({ type: "route" })
        getUser() {}
      }

      const instance = new TestService();
      const metadata = getMethodMetadata(instance, "getUser");
      expect(metadata[0].type).toBe("route");
    });
  });
});
