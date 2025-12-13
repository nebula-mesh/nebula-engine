import { serve } from "@hono/node-server";
import { Hono } from "hono";
import * as net from "net";
import { getClassesByKey, getClassMetadata } from "../metadata/metadata";
import { getAllHandlerMetadata } from "./decorators";
import { PluginNameRequiredError } from "./errors";
import logger from "./logger";
import {
  Class,
  HandlerMetadata,
  HandlerWrapper,
  MicroserviceOptions,
  ModuleMetadata,
  Plugin,
  PluginPriority,
} from "./types";

// 注意：MODULE_METADATA_KEY 已移除，每个工厂实例使用唯一的 key

/**
 * 微服务引擎实现类
 * @internal 此类型仅供内部使用，用户应通过 Factory.create() 创建引擎实例
 */
export class Microservice<ModuleOptions = Record<string, any>> {
  // 存储已注册的模块
  private modules: ModuleMetadata<ModuleOptions>[] = [];
  // 存储已注册的插件（按注册顺序）
  protected plugins: Plugin<Record<string, any>>[] = [];
  // 插件注册表（以name为键，用于覆盖逻辑）
  protected pluginRegistry: Map<string, Plugin<Record<string, any>>> =
    new Map();
  // 模块实例缓存（单例管理）
  private moduleInstances: Map<Class, any> = new Map();
  // 引擎配置（冻结，只读）
  public readonly options: Readonly<MicroserviceOptions>;
  // 是否已启动
  private started: boolean = false;
  // 模块元数据键（用于通过双向访问查找模块）
  private readonly moduleMetadataKey: symbol;

  // 实际使用的端口（启动后设置）
  private actualPort: number | null = null;
  // Hono 实例（由引擎统一管理）
  private hono: Hono = new Hono();
  // HTTP 服务器实例
  private server: any = null;

  constructor(options: MicroserviceOptions, moduleMetadataKey: symbol) {
    // 合并默认配置并冻结
    this.options = Object.freeze({
      hostname: "0.0.0.0",
      ...options,
    });
    this.moduleMetadataKey = moduleMetadataKey;
  }

  /**
   * 获取 Hono 实例（供插件使用）
   */
  getHono(): Hono {
    return this.hono;
  }

  /**
   * 内部注册插件方法（供构造函数和子类使用）
   * @protected
   */
  protected registerPlugin<T>(plugin: Plugin<T>): void {
    // 校验插件名称
    if (!plugin.name || plugin.name.trim() === "") {
      throw new PluginNameRequiredError();
    }

    // 处理插件覆盖逻辑
    const existingPlugin = this.pluginRegistry.get(plugin.name);
    if (existingPlugin) {
      // 移除旧插件
      const oldIndex = this.plugins.indexOf(existingPlugin);
      if (oldIndex >= 0) {
        this.plugins.splice(oldIndex, 1);
      }
      logger.info(`Override plugin: ${plugin.name}`);
    }

    // 注册新插件（使用类型断言，因为运行时兼容）
    this.pluginRegistry.set(plugin.name, plugin as Plugin<Record<string, any>>);
    this.plugins.push(plugin as Plugin<Record<string, any>>);
  }

  /**
   * 加载并注册所有模块（通过唯一的 key 查找）
   * 在引擎启动时调用，使用双向访问机制查找所有被装饰的类
   *
   * 注意：
   * - 每个引擎实例使用唯一的 moduleMetadataKey，实现隔离
   * - 模块类是静态的，可以被多个引擎实例共享
   * - 每个引擎实例会创建独立的模块实例，互不影响
   */
  private loadModules(): void {
    // 清空已注册的模块（每个引擎实例独立管理）
    this.modules = [];

    // 通过唯一的 key 获取所有被装饰的类（使用双向访问）
    const moduleClasses = getClassesByKey(this.moduleMetadataKey);

    for (const moduleClass of moduleClasses) {
      // 从元数据中获取模块信息
      const metadata = getClassMetadata(moduleClass, this.moduleMetadataKey);
      const moduleName = metadata.name || moduleClass.name;

      // 注意：允许同名模块注册
      // - 模块实例访问通过类（engine.get(ModuleClass)），不依赖模块名
      // - 包装链查找使用类名（clazz.name），不依赖模块名
      // - 同名模块可以共享路径和导航项（如 HtmxAdminPlugin 的 CRUD 场景）
      // - 允许将大模块拆分成多个类实现

      // 注册模块到引擎
      const moduleMetadata: ModuleMetadata<ModuleOptions> = {
        name: moduleName,
        clazz: moduleClass,
        options: (metadata.options || {}) as ModuleOptions,
      };

      this.modules.push(moduleMetadata);
    }
  }

  /**
   * 加载Handler元数据（平铺结构）
   * 每个装饰器都是独立的HandlerMetadata条目
   * 为每个方法创建包装链管理器，提供简单的 wrap API
   */
  private loadHandlerMetadata(): HandlerMetadata[] {
    const handlers: HandlerMetadata[] = [];
    // 为每个方法维护包装链（key: moduleName.methodName）
    const wrapperChains = new Map<string, HandlerWrapper[]>();
    // 保存原始方法引用（key: moduleName.methodName）
    const originalMethods = new Map<string, Function>();

    for (const module of this.modules) {
      // 重要：先实例化模块类，触发装饰器的 addInitializer，收集元数据
      // 这确保了 Stage 3 装饰器的元数据能够被正确收集
      if (!this.moduleInstances.has(module.clazz)) {
        this.get(module.clazz);
      }

      // 获取模块类的所有Handler元数据
      const allMetadata = getAllHandlerMetadata(module.clazz);

      for (const [methodName, metadataList] of allMetadata.entries()) {
        const method = (module.clazz.prototype as any)[methodName];
        const methodNameStr = String(methodName);
        const methodKey = `${module.clazz.name}.${methodNameStr}`;

        // 保存原始方法
        if (!originalMethods.has(methodKey)) {
          originalMethods.set(methodKey, method);
          wrapperChains.set(methodKey, []);
        }

        // 将每个装饰器元数据转换为独立的HandlerMetadata条目
        for (const meta of metadataList) {
          const chain = wrapperChains.get(methodKey)!;

          handlers.push({
            ...meta,
            method: originalMethods.get(methodKey)!,
            methodName: methodNameStr,
            module: module.clazz,
            // 提供简单的 wrap API：插件只需要调用这个方法
            wrap: (wrapper: HandlerWrapper) => {
              chain.push(wrapper);
            },
          });
        }
      }
    }

    // 保存包装链和原始方法，供 applyWrapperChains 使用
    (this as any).__wrapperChains__ = wrapperChains;
    (this as any).__originalMethods__ = originalMethods;

    return handlers;
  }

  /**
   * 应用所有包装链到原型
   * 在所有插件执行完 onHandlerLoad 后调用
   */
  private applyWrapperChains(): void {
    const wrapperChains = (this as any).__wrapperChains__ as Map<
      string,
      HandlerWrapper[]
    >;
    const originalMethods = (this as any).__originalMethods__ as Map<
      string,
      Function
    >;

    if (!wrapperChains || !originalMethods) return;

    // 为每个方法应用包装链
    for (const [methodKey, chain] of wrapperChains.entries()) {
      if (chain.length === 0) continue;

      // 解析方法键
      const [moduleName, methodName] = methodKey.split(".");
      const module = this.modules.find((m) => m.clazz.name === moduleName);
      if (!module) continue;

      const originalMethod = originalMethods.get(methodKey)!;
      const prototype = module.clazz.prototype;

      // 从后往前构建包装链（最后一个包装器在最外层）
      let wrappedMethod = originalMethod;

      for (let i = chain.length - 1; i >= 0; i--) {
        const wrapper = chain[i];
        const next = wrappedMethod;

        wrappedMethod = async function (this: any, ...args: any[]) {
          return wrapper(() => next.apply(this, args), this, ...args);
        } as Function;
      }

      // 更新原型
      prototype[methodName] = wrappedMethod;
    }
  }

  /**
   * 寻找一个随机的可用端口
   */
  private getRandomPort(hostname: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref(); // 防止 server.listen 保持进程活动
      server.on("error", reject);
      server.listen(0, hostname, () => {
        const port = (server.address() as net.AddressInfo).port;
        server.close((err) => {
          if (err) {
            return reject(err);
          }
          resolve(port);
        });
      });
    });
  }

  /**
   * 启动引擎
   * @param requestedPort 启动端口（可选，默认0，表示随机端口）
   * @returns 实际使用的端口号
   */
  async start(requestedPort: number = 0): Promise<number> {
    if (this.started) {
      throw new Error("Engine is already started");
    }

    try {
      // 1. 确定实际使用的端口
      const { port, hostname } = await this.determinePort(requestedPort);

      // 2. 初始化模块和插件
      this.initializeModulesAndPlugins();

      // 3. 处理 Handler 元数据和插件包装
      this.processHandlers();

      // 4. 执行插件启动钩子
      await this.executePluginStartHooks();

      // 5. 启动 HTTP 服务器
      this.startHttpServer(port, hostname);

      // 6. 标记为已启动
      this.started = true;
      logger.info(
        `${this.options.name} v${this.options.version} started successfully on port ${this.actualPort}`
      );

      return this.actualPort!;
    } catch (error) {
      logger.error("Failed to start engine", error);
      throw error;
    }
  }

  /**
   * 确定实际使用的端口
   */
  private async determinePort(
    requestedPort: number
  ): Promise<{ port: number; hostname: string }> {
    const hostname = this.options.hostname || "0.0.0.0";

    if (requestedPort !== 0) {
      // 如果指定了端口，直接使用该端口
      // 如果端口被占用，serve() 会抛出错误，这是正确的行为（容器部署需要固定端口）
      this.actualPort = requestedPort;
      return { port: this.actualPort, hostname };
    }

    // 如果没有指定端口（requestedPort === 0），使用随机端口
    this.actualPort = await this.getRandomPort(hostname);
    return { port: this.actualPort!, hostname };
  }

  /**
   * 初始化模块和插件
   */
  private initializeModulesAndPlugins(): void {
    // 加载并注册所有模块（从全局注册表扫描）
    this.loadModules();

    // 执行插件 onInit
    this.executePluginHook("onInit", (plugin) => {
      plugin.onInit?.(this as Microservice<Record<string, any>>);
    });

    // 执行插件 onModuleLoad
    this.executePluginHook("onModuleLoad", (plugin) => {
      plugin.onModuleLoad?.(
        this.modules as ModuleMetadata<Record<string, any>>[]
      );
    });
  }

  /**
   * 处理 Handler 元数据和插件包装
   */
  private processHandlers(): void {
    // 加载 Handler 元数据（平铺结构，包含 wrap API）
    const handlers = this.loadHandlerMetadata();

    // 按优先级排序插件
    const sortedPlugins = this.sortPluginsByPriority();

    // 分离包装插件和路由插件
    const { wrapperPlugins, routePlugins } =
      this.separateWrapperAndRoutePlugins(sortedPlugins);

    // 先执行包装插件（按优先级排序），它们可以调用 handler.wrap()
    this.executePluginHook(
      "onHandlerLoad",
      (plugin) => {
        plugin.onHandlerLoad?.(handlers);
      },
      wrapperPlugins
    );

    // 应用所有包装链到原型（在所有包装插件执行完后，RoutePlugin 执行前）
    this.applyWrapperChains();

    // 最后执行路由插件（按优先级排序，确保调用的是已被包装后的方法）
    this.executePluginHook(
      "onHandlerLoad",
      (plugin) => {
        plugin.onHandlerLoad?.(handlers);
      },
      routePlugins
    );
  }

  /**
   * 执行插件启动钩子
   */
  private async executePluginStartHooks(): Promise<void> {
    // 执行插件 onBeforeStart
    this.executePluginHook("onBeforeStart", (plugin) => {
      plugin.onBeforeStart?.(this as Microservice<Record<string, any>>);
    });

    // 执行插件 onAfterStart（支持异步）
    for (const plugin of this.plugins) {
      try {
        await plugin.onAfterStart?.(this as Microservice<Record<string, any>>);
      } catch (error) {
        throw new Error(
          `Plugin ${plugin.name} failed in onAfterStart: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // 在所有插件完成后，注册版本路由
    this.registerVersionRoute();
  }

  /**
   * 注册版本路由（/prefix/version）
   * 用于健康检查和探针
   */
  private registerVersionRoute(): void {
    const prefix = this.options.prefix || "";
    const versionPath = prefix ? `${prefix}` : "/";

    // 检查路由是否已存在
    // 使用 hono.routes 来检查已注册的路由
    const existingRoutes = this.hono.routes;
    const routeExists = existingRoutes.some(
      (route) => route.path === versionPath && route.method === "GET"
    );

    if (routeExists) {
      logger.info(
        `Version route ${versionPath} already exists, skipping registration`
      );
      return;
    }

    // 注册版本路由
    try {
      this.hono.get(versionPath, async (ctx) => {
        return ctx.json({
          name: this.options.name,
          version: this.options.version,
          status: "running",
        });
      });

      logger.info(`Registered version route: GET ${versionPath}`);
    } catch (error) {
      // 如果注册失败（可能是因为路由匹配器已经构建），记录日志
      if (
        error instanceof Error &&
        error.message.includes("matcher is already built")
      ) {
        logger.warn(
          `Cannot register version route ${versionPath}: route matcher is already built. ` +
            `If you have already registered a route at ${versionPath}, it will be used instead.`
        );
      } else {
        throw error;
      }
    }
  }

  /**
   * 启动 HTTP 服务器
   */
  private startHttpServer(port: number, hostname: string): void {
    // serve() 如果启动失败会抛出错误，成功则服务器立即可以接受连接
    this.server = serve({
      fetch: this.hono.fetch,
      port,
      hostname,
    });

    logger.info(`HTTP server started on http://${hostname}:${port}`);
  }

  /**
   * 按优先级排序插件
   */
  private sortPluginsByPriority(): Plugin[] {
    return [...this.plugins].sort((a, b) => {
      const priorityA = this.getPluginPriority(a);
      const priorityB = this.getPluginPriority(b);

      // 按优先级排序（数值越小，优先级越高）
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // 相同优先级按注册顺序（保持稳定排序）
      const indexA = this.plugins.indexOf(a);
      const indexB = this.plugins.indexOf(b);
      return indexA - indexB;
    });
  }

  /**
   * 获取插件优先级
   */
  private getPluginPriority(plugin: Plugin): number {
    return plugin.priority ?? PluginPriority.BUSINESS;
  }

  /**
   * 分离包装插件和路由插件
   */
  private separateWrapperAndRoutePlugins(sortedPlugins: Plugin[]): {
    wrapperPlugins: Plugin[];
    routePlugins: Plugin[];
  } {
    const wrapperPlugins: Plugin[] = [];
    const routePlugins: Plugin[] = [];

    for (const plugin of sortedPlugins) {
      const priority = this.getPluginPriority(plugin);
      if (priority === PluginPriority.ROUTE) {
        routePlugins.push(plugin);
      } else {
        wrapperPlugins.push(plugin);
      }
    }

    return { wrapperPlugins, routePlugins };
  }

  /**
   * 执行插件钩子（通用方法）
   */
  private executePluginHook(
    hookName: string,
    callback: (plugin: Plugin) => void,
    plugins: Plugin[] = this.plugins
  ): void {
    for (const plugin of plugins) {
      try {
        callback(plugin);
      } catch (error) {
        throw new Error(
          `Plugin ${plugin.name} failed in ${hookName}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }

  /**
   * 停止引擎
   */
  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    try {
      // 关闭 HTTP 服务器
      if (this.server) {
        // serve() 返回的对象可能不是标准的 Node.js Server
        // 检查是否有 close 方法，如果有则调用
        if (typeof this.server.close === "function") {
          // 尝试使用回调方式关闭（标准 Node.js Server）
          if (this.server.close.length > 0) {
            await new Promise<void>((resolve, reject) => {
              this.server.close((err: any) => {
                if (err) {
                  reject(err);
                } else {
                  resolve();
                }
              });
            });
          } else {
            // 如果没有回调参数，直接调用
            this.server.close();
            // 给一点时间让服务器完全关闭
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }
        this.server = null;
        logger.info("HTTP server stopped");
      }

      // 执行插件onDestroy（逆序）
      for (let i = this.plugins.length - 1; i >= 0; i--) {
        const plugin = this.plugins[i];
        try {
          await plugin.onDestroy?.();
        } catch (error) {
          logger.error(`Plugin ${plugin.name} failed in onDestroy`, error);
        }
      }

      // 清理资源
      this.modules = [];
      this.moduleInstances.clear();
      this.started = false;
      this.actualPort = null;

      logger.info(`${this.options.name} stopped`);
    } catch (error) {
      logger.error("Failed to stop engine", error);
      throw error;
    }
  }

  /**
   * 获取模块实例（单例）
   * @param moduleClass 模块类
   * @returns 模块实例
   */
  get<T extends Class>(moduleClass: T): InstanceType<T> {
    if (!this.moduleInstances.has(moduleClass)) {
      this.moduleInstances.set(moduleClass, new moduleClass());
    }
    return this.moduleInstances.get(moduleClass) as InstanceType<T>;
  }

  /**
   * 获取已注册的模块列表
   */
  getModules(): ModuleMetadata<Record<string, any>>[] {
    // 如果模块尚未加载，先加载模块
    if (this.modules.length === 0 && !this.started) {
      this.loadModules();
    }
    return [...this.modules] as ModuleMetadata<Record<string, any>>[];
  }

  /**
   * 获取实际使用的端口
   */
  getPort(): number | null {
    return this.actualPort;
  }

  /**
   * 确保引擎已初始化（模块和处理器已加载）
   * 如果引擎未启动，则执行必要的初始化步骤
   */
  private ensureInitialized(): void {
    if (this.started) {
      return; // 已启动，无需再次初始化
    }

    // 如果模块未加载，先加载模块和插件
    if (this.modules.length === 0) {
      this.initializeModulesAndPlugins();
    }

    // 如果处理器未处理，先处理处理器
    // 检查是否已应用包装链（通过检查是否有 __wrapperChains__）
    if (!(this as any).__wrapperChains__) {
      this.processHandlers();
    }
  }

  /**
   * 获取模块处理器方法（不启动 HTTP 服务器）
   * 适用于测试场景，可以完整执行中间件和处理逻辑
   *
   * 返回一个已绑定模块和方法名的调用函数，调用时只需要传递方法参数
   * 类型推导：自动推导方法参数类型和返回值类型（无需显式指定泛型参数）
   *
   * @param moduleClass 模块类
   * @param methodName 方法名（handler 名称）
   * @returns 调用函数，只需要传递方法参数
   *
   * @example
   * ```typescript
   * @Module("users")
   * class UserService {
   *   @Action({ params: [z.string(), z.number()] })
   *   add(a: string, b: number): { result: number } {
   *     return { result: Number(a) + b };
   *   }
   *
   *   @Action({ params: [z.string()] })
   *   getUser(id: string): Promise<{ id: string; name: string }> {
   *     return Promise.resolve({ id, name: "Alice" });
   *   }
   * }
   *
   * // 获取 handler 并调用（类型自动推导，无需显式指定泛型）
   * const addHandler = engine.handler(UserService, "add");
   * const result1 = await addHandler("10", 20);
   * // result1 的类型是 { result: number }
   *
   * // 也可以链式调用
   * const result2 = await engine.handler(UserService, "getUser")("123");
   * // result2 的类型是 { id: string; name: string }（自动解包 Promise）
   * ```
   */
  handler<T extends Class, M extends keyof InstanceType<T> & string>(
    moduleClass: T,
    methodName: M
  ): (
    ...args: InstanceType<T>[M] extends (...args: infer P) => any ? P : never
  ) => Promise<
    InstanceType<T>[M] extends (...args: any[]) => infer R
      ? R extends Promise<infer U>
        ? U
        : R
      : never
  > {
    return async (
      ...args: InstanceType<T>[M] extends (...args: infer P) => any ? P : never
    ) => {
      // 确保引擎已初始化
      this.ensureInitialized();

      // 获取模块实例
      const instance = this.get(moduleClass);

      // 获取方法
      const method = (instance as any)[methodName];
      if (typeof method !== "function") {
        throw new Error(
          `Handler ${String(methodName)} not found in module ${moduleClass.name}`
        );
      }

      // 调用方法（已经过包装链处理）
      return await method.call(instance, ...args);
    };
  }

  /**
   * 使用 Hono 的 request 方法调用路由处理器（不启动 HTTP 服务器）
   * 适用于测试场景，可以完整执行中间件和处理逻辑
   *
   * @param input Request 对象、URL 字符串或相对路径
   * @param init RequestInit 选项（当 input 是字符串时使用）
   * @returns Response 对象
   *
   * @example
   * ```typescript
   * // 使用相对路径
   * const response = await engine.request("/api/users/123");
   *
   * // 使用完整 URL
   * const response = await engine.request("http://localhost/api/users/123");
   *
   * // 使用 Request 对象
   * const request = new Request("http://localhost/api/users/123", {
   *   method: "POST",
   *   headers: { "Content-Type": "application/json" },
   *   body: JSON.stringify({ name: "Alice" }),
   * });
   * const response = await engine.request(request);
   * ```
   */
  async request(
    input: RequestInit | URL | string,
    init?: RequestInit
  ): Promise<Response> {
    // 确保引擎已初始化
    this.ensureInitialized();

    // 构建 Request 对象
    let request: Request;

    if (input instanceof Request) {
      request = input;
    } else if (typeof input === "string") {
      // 如果是相对路径，转换为完整 URL
      const url =
        input.startsWith("http://") || input.startsWith("https://")
          ? input
          : `http://localhost${input}`;
      request = new Request(url, init);
    } else {
      // URL 对象，需要转换为字符串
      request = new Request(input.toString(), init);
    }

    // 使用 Hono 的 request 方法
    return await this.hono.request(request);
  }
}
