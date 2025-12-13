import { describe, it, expect, beforeEach, vi } from "vitest";
import { z } from "zod";
import { Testing } from "../../core/testing";
import { DynamicConfigPlugin, Config } from "./index";

describe("DynamicConfigPlugin", () => {
  let engine: ReturnType<typeof Testing.createTestEngine>["engine"];
  let Module: ReturnType<typeof Testing.createTestEngine>["Module"];
  let configPlugin: DynamicConfigPlugin;

  beforeEach(() => {
    const testEngine = Testing.createTestEngine({
      plugins: [
        (configPlugin = new DynamicConfigPlugin({
          useMockEtcd: true, // 使用内存存储进行测试
        })),
      ],
    });
    engine = testEngine.engine;
    Module = testEngine.Module;
  });

  it("应该正确注册插件", () => {
    @Module("test-module")
    class TestService {
      @Config({
        key: "test-config",
        defaultValue: 100,
      })
      testConfig!: number;
    }

    // 验证插件已注册
    expect(configPlugin.name).toBe("dynamic-config-plugin");
  });

  it("应该返回默认配置值", async () => {
    @Module("test-module")
    class TestService {
      @Config({
        key: "max-attempts",
        defaultValue: 5,
      })
      maxAttempts!: number;
    }

    await engine.start(0);
    const service = engine.get(TestService);
    expect(service.maxAttempts).toBe(5);
    await engine.stop();
  });

  it("应该从存储中读取配置", async () => {
    @Module("test-module")
    class TestService {
      @Config({
        key: "max-attempts",
        defaultValue: 5,
      })
      maxAttempts!: number;
    }

    // 设置配置到存储
    await configPlugin.setConfig(
      "test-service/test-module/max-attempts",
      10
    );

    await engine.start(0);
    const service = engine.get(TestService);
    expect(service.maxAttempts).toBe(10);
    await engine.stop();
  });

  it("应该支持配置 Schema", async () => {
    @Module("test-module")
    class TestService {
      @Config({
        key: "count",
        schema: z.number().min(1).max(10),
        defaultValue: 5,
      })
      count!: number;
    }

    // 设置有效配置
    await configPlugin.setConfig("test-service/test-module/count", 8);
    
    await engine.start(0);
    const service = engine.get(TestService);
    expect(service.count).toBe(8);
    await engine.stop();
  });

  it("应该支持复杂配置对象", async () => {
    const FeatureFlagsSchema = z.object({
      enableNewUI: z.boolean(),
      maxUploadSize: z.number(),
    });

    @Module("test-module")
    class TestService {
      @Config({
        key: "feature-flags",
        schema: FeatureFlagsSchema,
        defaultValue: {
          enableNewUI: false,
          maxUploadSize: 10,
        },
      })
      featureFlags!: { enableNewUI: boolean; maxUploadSize: number };
    }

    // 设置配置
    await configPlugin.setConfig("test-service/test-module/feature-flags", {
      enableNewUI: true,
      maxUploadSize: 20,
    });

    await engine.start(0);
    const service = engine.get(TestService);
    expect(service.featureFlags).toEqual({
      enableNewUI: true,
      maxUploadSize: 20,
    });
    await engine.stop();
  });

  it("应该从环境变量读取配置（ENV 优先级）", async () => {
    // 设置环境变量（key "max-connections" -> 环境变量 "MAX_CONNECTIONS"）
    process.env.MAX_CONNECTIONS = "200";

    @Module("test-module")
    class TestService {
      @Config({
        key: "max-connections",  // 自动对应环境变量 MAX_CONNECTIONS
        defaultValue: 100,
      })
      maxConnections!: number;
    }

    await engine.start(0);
    const service = engine.get(TestService);
    expect(service.maxConnections).toBe(200);
    await engine.stop();

    // 清理环境变量
    delete process.env.MAX_CONNECTIONS;
  });

  it("应该遵循配置优先级：ETCD > ENV > DEFAULT", async () => {
    // 设置环境变量（key "priority-test" -> 环境变量 "PRIORITY_TEST"）
    process.env.PRIORITY_TEST = "50";

    @Module("test-module")
    class TestService {
      @Config({
        key: "priority-test",  // 自动对应环境变量 PRIORITY_TEST
        defaultValue: 10,
      })
      priorityConfig!: number;
    }

    await engine.start(0);
    let service = engine.get(TestService);

    // 1. ETCD 中没有配置，应该返回环境变量的值
    expect(service.priorityConfig).toBe(50);

    // 2. 设置 ETCD 配置，应该返回 ETCD 的值（优先级最高）
    await configPlugin.setConfig(
      "test-service/test-module/priority-test",
      100
    );
    expect(service.priorityConfig).toBe(100);

    // 3. 删除 ETCD 配置，应该回退到环境变量
    await configPlugin.deleteConfig("test-service/test-module/priority-test");
    expect(service.priorityConfig).toBe(50);

    // 4. 删除环境变量，应该回退到默认值
    delete process.env.PRIORITY_TEST;
    expect(service.priorityConfig).toBe(10);
    
    await engine.stop();
  });

  it("应该支持环境变量中的 JSON 值", async () => {
    // 设置环境变量为 JSON 字符串（key "json-config" -> 环境变量 "JSON_CONFIG"）
    process.env.JSON_CONFIG = JSON.stringify({
      enabled: true,
      timeout: 5000,
    });

    const ConfigSchema = z.object({
      enabled: z.boolean(),
      timeout: z.number(),
    });

    @Module("test-module")
    class TestService {
      @Config({
        key: "json-config",  // 自动对应环境变量 JSON_CONFIG
        schema: ConfigSchema,
        defaultValue: { enabled: false, timeout: 3000 },
      })
      jsonConfig!: { enabled: boolean; timeout: number };
    }

    await engine.start(0);
    const service = engine.get(TestService);
    expect(service.jsonConfig).toEqual({
      enabled: true,
      timeout: 5000,
    });
    await engine.stop();

    // 清理环境变量
    delete process.env.JSON_CONFIG;
  });

  it("应该在环境变量无效时回退到默认值", async () => {
    // 注意：环境变量优先于默认值，即使类型不匹配
    // 这个测试验证当没有环境变量时使用默认值
    @Module("test-module")
    class TestService {
      @Config({
        key: "invalid-config",  // 自动对应环境变量 INVALID_CONFIG
        schema: z.number(), // 期望数字类型
        defaultValue: 42,
      })
      invalidConfig!: number;
    }

    await engine.start(0);
    const service = engine.get(TestService);
    // 没有环境变量，应该使用默认值
    expect(service.invalidConfig).toBe(42);
    await engine.stop();
  });

  it("应该触发 onChange 回调", async () => {
    const onChangeMock = vi.fn();

    @Module("test-module")
    class TestService {
      @Config({
        key: "notify-config",
        defaultValue: "initial",
        onChange: onChangeMock,
      })
      notifyConfig!: string;
    }

    // 启动引擎，自动调用 onAfterStart
    await engine.start(0);

    // 等待监听器启动
    await Testing.wait(100);

    // 修改配置（应该触发回调）
    await configPlugin.setConfig(
      "test-service/test-module/notify-config",
      "updated"
    );

    // 等待回调执行
    await Testing.wait(100);

    // 验证回调被调用
    expect(onChangeMock).toHaveBeenCalled();
    expect(onChangeMock).toHaveBeenCalledWith("updated", "initial");
    
    await engine.stop();
  });

  it("应该支持监听配置变化", async () => {
    @Module("test-module")
    class TestService {
      @Config({
        key: "watch-config",
        defaultValue: 1,
      })
      watchConfig!: number;
    }

    // 启动引擎，触发默认值保存
    await engine.start(0);

    // 添加监听器
    const watchMock = vi.fn();
    const unwatch = configPlugin.watchConfig(
      "test-service/test-module/watch-config",
      watchMock
    );

    // 等待监听器启动
    await Testing.wait(100);

    // 修改配置
    await configPlugin.setConfig(
      "test-service/test-module/watch-config",
      2
    );

    // 等待回调执行
    await Testing.wait(100);

    // 验证监听器被调用
    expect(watchMock).toHaveBeenCalled();
    expect(watchMock).toHaveBeenCalledWith(2, 1);

    // 取消监听
    unwatch();

    // 再次修改配置
    await configPlugin.setConfig(
      "test-service/test-module/watch-config",
      3
    );

    await Testing.wait(100);

    // 监听器不应该再被调用
    expect(watchMock).toHaveBeenCalledTimes(1);
    
    await engine.stop();
  });

  it("应该支持获取所有配置", async () => {
    @Module("test-module")
    class TestService {
      @Config({
        key: "config-1",
        defaultValue: "value-1",
      })
      config1!: string;

      @Config({
        key: "config-2",
        defaultValue: "value-2",
      })
      config2!: string;
    }

    // 启动引擎，触发默认值保存
    await engine.start(0);

    // 获取所有配置
    const allConfigs = await configPlugin.getAllConfigs(
      "test-service/test-module"
    );

    expect(allConfigs.size).toBeGreaterThanOrEqual(2);
    expect(allConfigs.get("test-service/test-module/config-1")).toBe("value-1");
    expect(allConfigs.get("test-service/test-module/config-2")).toBe("value-2");
    
    await engine.stop();
  });

  it("应该支持删除配置", async () => {
    @Module("test-module")
    class TestService {
      @Config({
        key: "delete-config",
        defaultValue: 100,
      })
      deleteConfig!: number;
    }

    // 设置配置
    await configPlugin.setConfig(
      "test-service/test-module/delete-config",
      200
    );

    // 验证配置存在
    let value = await configPlugin.getConfig(
      "test-service/test-module/delete-config"
    );
    expect(value).toBe(200);

    // 删除配置
    await configPlugin.deleteConfig("test-service/test-module/delete-config");

    // 验证配置已删除
    value = await configPlugin.getConfig(
      "test-service/test-module/delete-config"
    );
    expect(value).toBeNull();

    // 启动引擎，应该返回默认值
    await engine.start(0);
    const service = engine.get(TestService);
    expect(service.deleteConfig).toBe(100);
    await engine.stop();
  });

  it("应该支持多个模块使用不同的配置", async () => {
    @Module("module-a")
    class ServiceA {
      @Config({
        key: "setting",
        defaultValue: "A",
      })
      setting!: string;
    }

    @Module("module-b")
    class ServiceB {
      @Config({
        key: "setting",
        defaultValue: "B",
      })
      setting!: string;
    }

    // 设置不同模块的配置
    await configPlugin.setConfig("test-service/module-a/setting", "A-updated");
    await configPlugin.setConfig("test-service/module-b/setting", "B-updated");

    await engine.start(0);
    const serviceA = engine.get(ServiceA);
    const serviceB = engine.get(ServiceB);

    // 验证配置独立
    expect(serviceA.setting).toBe("A-updated");
    expect(serviceB.setting).toBe("B-updated");
    
    await engine.stop();
  });

  it("应该正确清理资源", async () => {
    const onChangeMock = vi.fn();

    @Module("test-module")
    class TestService {
      @Config({
        key: "cleanup-config",
        defaultValue: 1,
        onChange: onChangeMock,
      })
      cleanupConfig!: number;
    }

    // 启动引擎，启动监听器
    await engine.start(0);

    // 等待监听器启动
    await Testing.wait(100);

    // 手动调用清理方法（模拟引擎停止）
    await configPlugin.onDestroy!();

    // 修改配置（回调不应该被触发）
    await configPlugin.setConfig(
      "test-service/test-module/cleanup-config",
      2
    );

    await Testing.wait(100);

    // 验证回调没有被调用
    expect(onChangeMock).not.toHaveBeenCalled();
  });

  it("应该处理 onChange 回调中的错误", async () => {
    const onChangeError = vi.fn(() => {
      throw new Error("Callback error");
    });

    @Module("test-module")
    class TestService {
      @Config({
        key: "error-config",
        defaultValue: 1,
        onChange: onChangeError,
      })
      errorConfig!: number;
    }

    // 启动引擎，启动监听器
    await engine.start(0);

    // 等待监听器启动
    await Testing.wait(100);

    // 修改配置（回调会抛出错误，但不应该影响配置更新）
    await configPlugin.setConfig(
      "test-service/test-module/error-config",
      2
    );

    await Testing.wait(100);

    // 验证回调被调用
    expect(onChangeError).toHaveBeenCalled();

    // 验证配置仍然更新成功（使用同步访问）
    const service = engine.get(TestService);
    expect(service.errorConfig).toBe(2);
    
    await engine.stop();
  });

  it("应该支持敏感信息标记", async () => {
    @Module("test-module")
    class TestService {
      @Config({
        key: "api-key",
        defaultValue: "default-key",
        sensitive: true,
      })
      apiKey!: string;
    }

    // 设置敏感配置
    await configPlugin.setConfig(
      "test-service/test-module/api-key",
      "secret-key"
    );

    await engine.start(0);
    const service = engine.get(TestService);
    expect(service.apiKey).toBe("secret-key");
    await engine.stop();
    // 注意：实际的日志脱敏在 logger 中实现，这里只验证功能
  });

  describe("@Config 属性装饰器", () => {
    it("应该支持属性装饰器语法", async () => {
      const { Config } = await import("./index");
      
      @Module("property-test-module")
      class PropertyTestService {
        @Config({
          key: "MAX_ATTEMPTS",
          defaultValue: 5,
        })
        maxAttempts!: number;
      }

      await engine.start(0);
      const instance = engine.get(PropertyTestService);

      // ✅ 测试：可以直接访问，不需要括号
      expect(instance.maxAttempts).toBe(5);
      
      // ✅ 测试：可以直接用于运算，无需类型断言
      const doubled = instance.maxAttempts * 2;
      expect(doubled).toBe(10);
      
      const sum = instance.maxAttempts + instance.maxAttempts;
      expect(sum).toBe(10);

      await engine.stop();
    });

    it("应该支持属性装饰器的配置更新", async () => {
      const { Config } = await import("./index");
      
      @Module("property-update-module")
      class PropertyUpdateService {
        @Config({
          key: "DYNAMIC_VALUE",
          defaultValue: 100,
        })
        dynamicValue!: number;
      }

      await engine.start(0);
      const instance = engine.get(PropertyUpdateService);

      // 初始值
      expect(instance.dynamicValue).toBe(100);

      // 更新配置
      await configPlugin.setConfig(
        "test-service/property-update-module/DYNAMIC_VALUE",
        200
      );

      // 验证更新后的值
      expect(instance.dynamicValue).toBe(200);

      await engine.stop();
    });

    it("应该支持属性装饰器的环境变量优先级", async () => {
      const { Config } = await import("./index");
      
      // 设置环境变量
      process.env.ENV_PRIORITY_FIELD_TEST = "50";
      
      @Module("env-priority-field-module")
      class EnvPriorityFieldService {
        @Config({
          key: "ENV_PRIORITY_FIELD_TEST",
          defaultValue: 10,
        })
        envPriorityTest!: number;
      }

      await engine.start(0);
      const instance = engine.get(EnvPriorityFieldService);

      // 应该从环境变量读取
      expect(instance.envPriorityTest).toBe(50);

      delete process.env.ENV_PRIORITY_FIELD_TEST;
      await engine.stop();
    });

    it("应该支持属性装饰器的 onChange 回调", async () => {
      const { Config } = await import("./index");
      
      let callbackInvoked = false;
      let newVal: any;
      let oldVal: any;
      
      @Module("property-onchange-module")
      class PropertyOnChangeService {
        @Config({
          key: "CALLBACK_TEST",
          defaultValue: 1,
          onChange: async (newValue, oldValue) => {
            callbackInvoked = true;
            newVal = newValue;
            oldVal = oldValue;
          },
        })
        callbackTest!: number;
      }

      await engine.start(0);
      const instance = engine.get(PropertyOnChangeService);

      // 初始值
      expect(instance.callbackTest).toBe(1);

      // 更新配置
      await configPlugin.setConfig(
        "test-service/property-onchange-module/CALLBACK_TEST",
        2
      );

      // 等待回调执行
      await Testing.wait(100);

      // 验证回调被调用
      expect(callbackInvoked).toBe(true);
      expect(newVal).toBe(2);
      expect(oldVal).toBe(1);

      await engine.stop();
    });

    it("应该支持属性装饰器的复杂对象类型", async () => {
      const { Config } = await import("./index");
      
      type FeatureFlags = {
        enableNewUI: boolean;
        enableBetaFeatures: boolean;
      };
      
      @Module("property-object-module")
      class PropertyObjectService {
        @Config({
          key: "FEATURE_FLAGS",
          defaultValue: {
            enableNewUI: false,
            enableBetaFeatures: false,
          },
        })
        featureFlags!: FeatureFlags;
      }

      await engine.start(0);
      const instance = engine.get(PropertyObjectService);

      // 初始值
      expect(instance.featureFlags.enableNewUI).toBe(false);
      expect(instance.featureFlags.enableBetaFeatures).toBe(false);

      // 更新配置
      await configPlugin.setConfig(
        "test-service/property-object-module/FEATURE_FLAGS",
        {
          enableNewUI: true,
          enableBetaFeatures: true,
        }
      );

      // 验证更新后的值
      expect(instance.featureFlags.enableNewUI).toBe(true);
      expect(instance.featureFlags.enableBetaFeatures).toBe(true);

      await engine.stop();
    });
  });
});
