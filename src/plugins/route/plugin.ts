import { Context, MiddlewareHandler } from "hono";
import { Microservice } from "../../core/engine";
import logger from "../../core/logger";
import {
  HandlerMetadata,
  Plugin,
  PluginModuleOptionsSchema,
  PluginPriority,
} from "../../core/types";
import {
  RouteModuleOptions,
  RouteOptions,
  RoutePluginOptions,
  ErrorTransformer,
} from "./types";

/**
 * RoutePlugin - 核心路由插件
 * 负责解析type="route"的Handler元数据，注册HTTP路由到Hono实例
 *
 * @example
 * ```typescript
 * // 使用全局前缀和中间件
 * const authMiddleware = async (ctx, next) => {
 *   // 验证 token
 *   await next();
 * };
 *
 * const routePlugin = new RoutePlugin({
 *   prefix: "/api", // 全局路径前缀，所有路由都会加上这个前缀
 *   globalMiddlewares: [authMiddleware],
 * });
 * ```
 */
export class RoutePlugin implements Plugin<RouteModuleOptions> {
  public readonly name = "route-plugin";
  public readonly priority = PluginPriority.ROUTE;
  private engine!: Microservice;
  private globalPrefix: string;
  private globalMiddlewares: MiddlewareHandler[];
  private errorTransformer?: ErrorTransformer;

  /**
   * 构造函数
   * @param options 插件配置选项
   */
  constructor(options?: RoutePluginOptions) {
    this.globalPrefix = options?.prefix || "";
    this.globalMiddlewares = options?.globalMiddlewares || [];
    this.errorTransformer = options?.errorTransformer;
  }

  /**
   * 声明Module配置Schema（用于类型推导+运行时校验）
   */
  getModuleOptionsSchema(): PluginModuleOptionsSchema<RouteModuleOptions> {
    return {
      _type: {} as RouteModuleOptions,
      validate: (options) => {
        if (
          options.routePrefix !== undefined &&
          typeof options.routePrefix !== "string"
        ) {
          return "routePrefix must be a string";
        }
        if (options.routePrefix && !options.routePrefix.startsWith("/")) {
          return `routePrefix must start with '/'`;
        }
        if (
          options.routeMiddlewares !== undefined &&
          !Array.isArray(options.routeMiddlewares)
        ) {
          return "routeMiddlewares must be an array";
        }
        return true;
      },
    };
  }

  /**
   * 引擎初始化钩子：获取Hono实例
   */
  onInit(engine: Microservice): void {
    this.engine = engine;
    logger.info("RoutePlugin initialized");
  }

  /**
   * Handler加载钩子：解析type="route"的Handler元数据，注册HTTP路由
   */
  onHandlerLoad(handlers: HandlerMetadata[]): void {
    // 筛选出所有type="route"的Handler元数据
    const routeHandlers = handlers.filter(
      (handler) => handler.type === "route"
    );

    logger.info(`Found ${routeHandlers.length} route handler(s)`);

    for (const handler of routeHandlers) {
      const routeOptions = handler.options as RouteOptions;
      const methodName = handler.methodName;
      const moduleClass = handler.module;

      // 获取模块实例
      const moduleInstance = this.engine.get(moduleClass);
      if (!moduleInstance) {
        logger.warn(
          `Module instance not found for ${moduleClass.name}, skipping route registration`
        );
        continue;
      }

      // 获取模块配置
      const moduleMetadata = this.engine
        .getModules()
        .find((m: any) => m.clazz === moduleClass);
      const moduleOptions = (moduleMetadata?.options ||
        {}) as RouteModuleOptions;

      // 构建路由路径数组（支持单个路径或多个路径）
      // 路径拼接顺序：全局前缀 + 模块前缀 + 路由路径
      const routePrefix = moduleOptions.routePrefix || "";
      const paths = Array.isArray(routeOptions.path)
        ? routeOptions.path
        : [routeOptions.path];
      const fullPaths = paths.map((p) => this.globalPrefix + routePrefix + p);

      // 构建路由处理器
      const routeHandler = async (ctx: Context) => {
        // 引擎保证此时原型上的方法已经被所有包装插件包装
        // 直接调用方法名即可获取包装后的方法
        const method = (moduleInstance as any)[methodName];
        if (typeof method !== "function") {
          return ctx.json({ error: "Handler method not found" }, 500);
        }

        try {
          const result = await method.call(moduleInstance, ctx);
          
          // 处理 undefined：返回 204 No Content
          if (result === undefined) {
            return new Response(null, { status: 204 });
          }
          
          // Response 对象：直接返回
          if (result instanceof Response) {
            return result;
          }
          
          // 字符串：使用 ctx.text() 设置正确的 Content-Type
          if (typeof result === "string") {
            return ctx.text(result);
          }
          
          // null：返回空响应
          if (result === null) {
            return new Response(null, { status: 204 });
          }
          
          // 检查是否是 Hono html 模板字符串（HtmlEscaped 类型）
          // html 模板字符串通常有 isEscaped 属性或特定的构造函数
          if (
            typeof result === "object" &&
            result !== null &&
            ((result as any).isEscaped === true ||
              (result as any).constructor?.name === "HtmlEscaped")
          ) {
            // html 模板字符串：使用 ctx.html() 确保 Content-Type 正确设置为 text/html
            return ctx.html(result as any);
          }
          
          // 检查是否是 JSX 元素（通常有 type 属性且是函数或字符串）
          // JSX 元素通常是对象，type 是函数或字符串
          if (
            typeof result === "object" &&
            result !== null &&
            "type" in result &&
            (typeof (result as any).type === "function" ||
              typeof (result as any).type === "string")
          ) {
            // JSX 元素：使用 ctx.html() 确保 Content-Type 正确设置为 text/html
            // Hono 的 JSX 中间件会将 JSX 转换为字符串，我们需要确保 Content-Type 正确
            return ctx.html(result as any);
          }
          
          // 普通对象或数组：使用 ctx.json() 转换为 JSON
          // 这样可以确保 Content-Type 正确设置为 application/json
          return ctx.json(result);
        } catch (error) {
          logger.error(
            `Error in route handler ${moduleClass.name}.${methodName}`,
            error
          );

          // 如果配置了错误转换函数，使用它来转换错误响应
          if (this.errorTransformer) {
            try {
              const transformedResponse = await this.errorTransformer(
                ctx,
                error,
                handler
              );
              return transformedResponse;
            } catch (transformerError) {
              logger.error(
                `Error transformer failed for ${moduleClass.name}.${methodName}`,
                transformerError
              );
              // 如果错误转换函数本身出错，回退到默认错误响应
            }
          }

          // 默认错误响应
          return ctx.json(
            {
              error: "Internal server error",
              message: error instanceof Error ? error.message : String(error),
            },
            500
          );
        }
      };

      // 获取 Hono 实例
      const hono = this.engine.getHono();

      // 注册路由（支持单个方法或多个方法，默认为 GET）
      const methods = routeOptions.method
        ? Array.isArray(routeOptions.method)
          ? routeOptions.method
          : [routeOptions.method]
        : ["GET"];

      // 为每个路径注册路由
      for (const fullPath of fullPaths) {
        let route = hono;

        // 应用全局中间件（最先执行）
        if (this.globalMiddlewares.length > 0) {
          route = route.use(fullPath, ...this.globalMiddlewares);
        }

        // 应用模块级中间件
        if (
          moduleOptions.routeMiddlewares &&
          moduleOptions.routeMiddlewares.length > 0
        ) {
          route = route.use(fullPath, ...moduleOptions.routeMiddlewares);
        }

        // 应用路由级中间件（最后执行）
        if (routeOptions.middlewares && routeOptions.middlewares.length > 0) {
          route = route.use(fullPath, ...routeOptions.middlewares);
        }

        // 为每个 HTTP 方法注册路由
        for (const method of methods) {
          const methodLower = method.toLowerCase();
          if (
            methodLower === "get" ||
            methodLower === "post" ||
            methodLower === "put" ||
            methodLower === "delete" ||
            methodLower === "patch" ||
            methodLower === "head" ||
            methodLower === "options"
          ) {
            (route as any)[methodLower](fullPath, routeHandler);
            const description = routeOptions.description
              ? ` (${routeOptions.description})`
              : "";
            logger.info(
              `Registered route: ${method.toUpperCase()} ${fullPath} -> ${moduleClass.name}.${methodName}${description}`
            );
          } else {
            logger.warn(
              `Unsupported HTTP method: ${method}, skipping route ${fullPath}`
            );
          }
        }
      }
    }
  }
}
