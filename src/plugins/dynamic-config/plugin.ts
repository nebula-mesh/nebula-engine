import logger from "../../core/logger";
import { getAllHandlerFieldMetadata } from "../../core/decorators";
import type {
  HandlerMetadata,
  Microservice,
  Plugin,
  PluginModuleOptionsSchema,
} from "../../core/types";
import { PluginPriority } from "../../core/types";
import { EtcdConfigStorage, MemoryConfigStorage } from "./storage";
import type {
  ConfigMetadata,
  ConfigStorage,
  DynamicConfigModuleOptions,
  DynamicConfigOptions,
  DynamicConfigPluginOptions,
} from "./types";

/**
 * 将配置 key 转换为环境变量名
 * kebab-case -> UPPER_SNAKE_CASE
 *
 * @param key 配置键名（如 "max-connections"）
 * @returns 环境变量名（如 "MAX_CONNECTIONS"）
 *
 * @example
 * ```typescript
 * keyToEnvName("max-connections") // => "MAX_CONNECTIONS"
 * keyToEnvName("pool-size") // => "POOL_SIZE"
 * keyToEnvName("feature-flags") // => "FEATURE_FLAGS"
 * ```
 */
function keyToEnvName(key: string): string {
  return key.toUpperCase().replace(/-/g, "_");
}

/**
 * 从环境变量中读取配置值
 * 支持 JSON 解析和基本类型转换
 *
 * @param envKey 环境变量键名
 * @returns 解析后的值，如果环境变量不存在则返回 undefined
 */
function getEnvValue(envKey: string): any {
  const value = process.env[envKey];

  if (value === undefined || value === null) {
    return undefined;
  }

  // 尝试 JSON 解析（支持对象、数组、布尔值、数字等）
  try {
    return JSON.parse(value);
  } catch {
    // JSON 解析失败，返回原始字符串
    return value;
  }
}

/**
 * DynamicConfigPlugin - 动态配置插件
 *
 * 提供基于 etcd 的动态配置功能，支持：
 * - 装饰器驱动的配置定义 (@Config)
 * - 实时配置热更新（通过 etcd watch 机制）
 * - 类型安全（Zod Schema 运行时验证）
 * - 完美的 TypeScript 类型推断
 * - 自动预加载配置到缓存
 * - 配置变更回调
 * - 同步访问配置
 *
 * @example
 * ```typescript
 * // 基础用法
 * const plugin = new DynamicConfigPlugin({
 *   etcdClient: etcdInstance,
 *   etcdPrefix: "/config",
 * });
 *
 * @Module("user-service")
 * class UserService {
 *   @Config({
 *     key: "MAX_LOGIN_ATTEMPTS",
 *     defaultValue: 5,
 *     schema: z.number().min(1).max(10),
 *   })
 *   maxLoginAttempts!: number;
 * }
 * ```
 */
export class DynamicConfigPlugin implements Plugin<DynamicConfigModuleOptions> {
  public readonly name = "dynamic-config-plugin";
  public readonly priority = PluginPriority.BUSINESS;

  private engine!: Microservice;
  private storage: ConfigStorage;
  private configHandlers: HandlerMetadata[] = [];
  private unwatchFunctions: Map<string, () => void> = new Map();

  constructor(options?: DynamicConfigPluginOptions) {
    // 初始化存储
    if (options?.useMockEtcd) {
      // 使用内存存储（测试和本地开发）
      this.storage = new MemoryConfigStorage();
      logger.info(
        "DynamicConfigPlugin: Using MemoryConfigStorage for local development/testing"
      );
    } else if (options?.etcdClient) {
      // 使用 etcd 存储
      this.storage = new EtcdConfigStorage(
        options.etcdClient,
        options.etcdPrefix || "/config"
      );
      logger.info("DynamicConfigPlugin: Using EtcdConfigStorage");
    } else {
      // 默认使用内存存储
      this.storage = new MemoryConfigStorage();
      logger.warn(
        "DynamicConfigPlugin: No etcdClient provided, using MemoryConfigStorage"
      );
    }
  }

  /**
   * 声明 Module 配置 Schema
   */
  getModuleOptionsSchema(): PluginModuleOptionsSchema<DynamicConfigModuleOptions> {
    return {
      _type: {} as DynamicConfigModuleOptions,
      validate: (options) => {
        return true; // 目前没有特殊验证规则
      },
    };
  }

  /**
   * 引擎初始化钩子
   */
  onInit(engine: Microservice): void {
    this.engine = engine;
    logger.info("DynamicConfigPlugin initialized");
  }

  /**
   * Handler 加载钩子：收集所有动态配置
   */
  onHandlerLoad(handlers: HandlerMetadata[]): void {
    // 筛选出所有 type="dynamic-config" 的 handlers
    this.configHandlers = handlers.filter(
      (handler) => handler.type === "dynamic-config"
    );

    logger.info(
      `DynamicConfigPlugin: Found ${this.configHandlers.length} dynamic config handler(s)`
    );

    // 包装配置方法
    for (const handler of this.configHandlers) {
      this.wrapConfigHandler(handler);
    }
  }

  /**
   * 包装配置方法，实现动态配置注入
   */
  private wrapConfigHandler(handler: HandlerMetadata): void {
    const options = handler.options as DynamicConfigOptions;
    const moduleName = this.getModuleName(handler.module);
    const methodName = handler.methodName;

    // 构建完整的配置键：{serviceName}/{moduleName}/{configKey}
    const configKey = this.buildConfigKey(moduleName, options.key);

    logger.info(
      `DynamicConfigPlugin: Wrapping ${moduleName}.${methodName} with config key: ${configKey}`
    );

    // 使用 handler.wrap() 包装方法
    handler.wrap(async (next, instance, ...args) => {
      // 优先级 1: 从 ETCD/存储中获取配置
      let configValue = await this.storage.get(configKey);
      const fromStorage = configValue !== null && configValue !== undefined;
      let fromEnv = false;

      // 优先级 2: 如果 ETCD 中没有，尝试从环境变量读取
      // 将 key 自动转换为环境变量名 (kebab-case -> UPPER_SNAKE_CASE)
      if (!fromStorage) {
        const envKey = keyToEnvName(options.key);
        configValue = getEnvValue(envKey);
        if (configValue !== undefined) {
          fromEnv = true;
          logger.debug(
            `DynamicConfigPlugin: Loaded config from env: ${configKey} (${envKey})`
          );
        }
      }

      // 优先级 3: 如果环境变量也没有，使用默认值
      if (configValue === null || configValue === undefined) {
        configValue = options.defaultValue;
      }

      // Zod Schema 验证
      if (options.schema && configValue !== undefined) {
        try {
          configValue = options.schema.parse(configValue);
        } catch (error) {
          logger.error(
            `DynamicConfigPlugin: Config validation failed for ${configKey}`,
            error
          );
          // 验证失败，使用默认值
          configValue = options.defaultValue;
        }
      }

      // 如果配置来自默认值（非 storage、非环境变量），则将其写入 storage
      // 这样可以确保 onChange 回调中的 oldValue 正确
      // 注意：不缓存环境变量的值，因为环境变量是动态的
      if (
        !fromStorage &&
        !fromEnv &&
        configValue !== undefined &&
        configValue !== null
      ) {
        try {
          await this.storage.set(configKey, configValue);
        } catch (error) {
          logger.error(
            `DynamicConfigPlugin: Failed to cache config value for ${configKey}`,
            error
          );
        }
      }

      // 返回配置值（不调用原始方法）
      return configValue;
    });
  }

  /**
   * 引擎启动后钩子：启动配置监听和预加载配置
   */
  async onAfterStart(engine: Microservice): Promise<void> {
    // 预加载所有配置到缓存
    await this.preloadConfigs();

    // 初始化所有配置的监听
    for (const handler of this.configHandlers) {
      const options = handler.options as DynamicConfigOptions;
      const moduleName = this.getModuleName(handler.module);
      const configKey = this.buildConfigKey(moduleName, options.key);

      // 如果有 onChange 回调，添加监听
      if (options.onChange) {
        const unwatch = this.storage.watch(
          configKey,
          async (newValue, oldValue) => {
            try {
              logger.info(
                `DynamicConfigPlugin: Config changed for ${configKey}`,
                {
                  sensitive: options.sensitive,
                  oldValue: options.sensitive ? "***" : oldValue,
                  newValue: options.sensitive ? "***" : newValue,
                }
              );

              await options.onChange!(newValue, oldValue);
            } catch (error) {
              logger.error(
                `DynamicConfigPlugin: onChange callback error for ${configKey}`,
                error
              );
            }
          }
        );

        this.unwatchFunctions.set(configKey, unwatch);
      }
    }

    logger.info(
      `DynamicConfigPlugin: Started watching ${this.unwatchFunctions.size} config(s)`
    );
  }

  /**
   * 预加载所有配置到缓存，并将配置方法/属性转换为同步 getter
   */
  private async preloadConfigs(): Promise<void> {
    const modules = this.engine.getModules();
    
    for (const moduleMetadata of modules) {
      const moduleClass = moduleMetadata.clazz;
      const moduleInstance = this.engine.get(moduleClass);
      
      // 获取该模块的配置元数据（方法装饰器）
      const moduleConfigHandlers = this.configHandlers.filter(
        (h) => h.module === moduleClass
      );
      
      // 获取该模块的配置元数据（属性装饰器）
      const fieldMetadata = getAllHandlerFieldMetadata(moduleClass);
      const moduleConfigFields = Array.from(fieldMetadata.entries())
        .filter(([_, handlers]) => 
          handlers.some(h => h.type === "dynamic-config")
        );
      
      if (moduleConfigHandlers.length === 0 && moduleConfigFields.length === 0) {
        continue;
      }
      
      // 预加载每个配置（方法装饰器）并创建同步 getter
      for (const handler of moduleConfigHandlers) {
        const methodName = handler.methodName;
        const method = (moduleInstance as any)[methodName];
        
        if (typeof method === "function") {
          try {
            // 调用一次方法，触发配置加载和缓存
            const configValue = await method.call(moduleInstance);
            
            // 获取配置键
            const options = handler.options as DynamicConfigOptions;
            const moduleName = this.getModuleName(moduleClass);
            const configKey = this.buildConfigKey(moduleName, options.key);
            
            // 如果 storage 中没有配置（即使用了 env 或 default），将当前值写入缓存
            // 这样可以确保 onChange 回调中的 oldValue 正确
            const cachedValue = this.storage.getCached
              ? this.storage.getCached(configKey)
              : undefined;
            
            if (cachedValue === null || cachedValue === undefined) {
              // 将当前值（来自 env 或 default）写入 storage，不触发 watch 回调
              if (configValue !== undefined && configValue !== null) {
                await this.storage.set(configKey, configValue);
              }
            }
            
            // 将方法替换为同步 getter
            Object.defineProperty(moduleInstance, methodName, {
              get: () => {
                // 优先级 1: 从 storage 缓存中同步读取
                let value = this.storage.getCached
                  ? this.storage.getCached(configKey)
                  : undefined;
                
                // 优先级 2: 如果缓存中没有，尝试从环境变量读取
                // 将 key 自动转换为环境变量名
                if (value === null || value === undefined) {
                  const envKey = keyToEnvName(options.key);
                  value = getEnvValue(envKey);
                }
                
                // 优先级 3: 使用默认值
                return value !== undefined && value !== null
                  ? value
                  : options.defaultValue;
              },
              enumerable: true,
              configurable: true,
            });
          } catch (error) {
            logger.error(
              `DynamicConfigPlugin: Failed to preload config ${moduleMetadata.name}.${methodName}`,
              error
            );
          }
        }
      }
      
      // 预加载每个配置（属性装饰器）并创建同步 getter
      for (const [fieldName, handlers] of moduleConfigFields) {
        const configHandler = handlers.find(h => h.type === "dynamic-config");
        if (!configHandler) continue;
        
        try {
          const options = configHandler.options as DynamicConfigOptions;
          const moduleName = this.getModuleName(moduleClass);
          const configKey = this.buildConfigKey(moduleName, options.key);
          
          // 从 storage/env/default 读取配置值
          let configValue = await this.storage.get(configKey);
          
          // 如果 storage 中没有，尝试从环境变量读取
          if (configValue === null || configValue === undefined) {
            const envKey = keyToEnvName(options.key);
            configValue = getEnvValue(envKey);
          }
          
          // 如果环境变量也没有，使用默认值
          if (configValue === null || configValue === undefined) {
            configValue = options.defaultValue;
          }
          
          // 如果 storage 中没有配置（即使用了 env 或 default），将当前值写入缓存
          const cachedValue = this.storage.getCached
            ? this.storage.getCached(configKey)
            : undefined;
          
          if (cachedValue === null || cachedValue === undefined) {
            // 将当前值写入 storage，不触发 watch 回调
            if (configValue !== undefined && configValue !== null) {
              await this.storage.set(configKey, configValue);
            }
          }
          
          // 为属性创建同步 getter
          Object.defineProperty(moduleInstance, fieldName, {
            get: () => {
              // 优先级 1: 从 storage 缓存中同步读取
              let value = this.storage.getCached
                ? this.storage.getCached(configKey)
                : undefined;
              
              // 优先级 2: 如果缓存中没有，尝试从环境变量读取
              if (value === null || value === undefined) {
                const envKey = keyToEnvName(options.key);
                value = getEnvValue(envKey);
              }
              
              // 优先级 3: 使用默认值
              return value !== undefined && value !== null
                ? value
                : options.defaultValue;
            },
            enumerable: true,
            configurable: true,
          });
          
          // 将属性配置添加到 configHandlers 中，用于 watch 监听
          const fieldHandler: HandlerMetadata = {
            ...configHandler,
            methodName: String(fieldName),
            module: moduleClass,
            method: () => {}, // 属性没有 method，使用 any 绕过类型检查
          };
          this.configHandlers.push(fieldHandler);
        } catch (error) {
          logger.error(
            `DynamicConfigPlugin: Failed to preload config ${moduleMetadata.name}.${String(fieldName)}`,
            error
          );
        }
      }
    }
    
    logger.info(
      `DynamicConfigPlugin: Preloaded ${this.configHandlers.length} config(s) and created sync accessors`
    );
  }

  /**
   * 引擎销毁钩子：清理资源
   */
  async onDestroy(): Promise<void> {
    // 取消所有监听
    for (const unwatch of this.unwatchFunctions.values()) {
      unwatch();
    }
    this.unwatchFunctions.clear();

    // 清理存储资源
    if (
      this.storage &&
      typeof (this.storage as any).destroy === "function"
    ) {
      await (this.storage as any).destroy();
    }

    logger.info("DynamicConfigPlugin: Cleanup completed");
  }

  /**
   * 获取模块名称
   */
  private getModuleName(moduleClass: any): string {
    const moduleMetadata = this.engine
      .getModules()
      .find((m) => m.clazz === moduleClass);

    return moduleMetadata?.name || moduleClass.name;
  }

  /**
   * 构建完整的配置键
   */
  private buildConfigKey(moduleName: string, configKey: string): string {
    const serviceName = this.engine.options.name;
    return `${serviceName}/${moduleName}/${configKey}`;
  }

  /**
   * 公共 API：获取配置
   */
  async getConfig(key: string): Promise<any> {
    return await this.storage.get(key);
  }

  /**
   * 公共 API：同步获取配置（从缓存）
   * 用于 configProxy 的同步访问
   */
  getConfigCached(key: string): any {
    return this.storage.getCached ? this.storage.getCached(key) : undefined;
  }

  /**
   * 公共 API：设置配置
   */
  async setConfig(
    key: string,
    value: any,
    metadata?: ConfigMetadata
  ): Promise<void> {
    await this.storage.set(key, value, metadata);
  }

  /**
   * 公共 API：删除配置
   */
  async deleteConfig(key: string): Promise<void> {
    await this.storage.delete(key);
  }

  /**
   * 公共 API：获取所有配置
   */
  async getAllConfigs(prefix?: string): Promise<Map<string, any>> {
    return await this.storage.getAll(prefix);
  }

  /**
   * 公共 API：监听配置变化
   */
  watchConfig(
    key: string,
    callback: (newValue: any, oldValue: any) => void
  ): () => void {
    return this.storage.watch(key, callback);
  }
}
