import { Context, MiddlewareHandler } from "hono";
import { ContentfulStatusCode } from "hono/utils/http-status";
import { HandlerMetadata } from "../../core/types";

// HTTP方法类型
export type HTTPMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "HEAD"
  | "OPTIONS";
/**
 * Route装饰器配置选项
 */
export interface RouteOptions {
  /**
   * HTTP方法（可选，默认为 GET）
   * 如果未指定，则默认为 GET 方法
   */
  method?: HTTPMethod | HTTPMethod[]; // HTTP方法
  /**
   * 路由路径（支持单个路径或多个路径）
   * 如果提供数组，将为每个路径注册相同的处理器
   */
  path: string | string[]; // 路由路径
  /**
   * 路由专属中间件
   */
  middlewares?: MiddlewareHandler[]; // 路由专属中间件
  /**
   * 路由描述（用于文档和日志）
   */
  description?: string;
  /**
   * 请求参数校验规则
   */
  validate?: {
    query?: Record<string, any>;
    body?: Record<string, any>;
    params?: Record<string, any>;
  };
  /**
   * 响应配置
   */
  response?: {
    status?: ContentfulStatusCode;
    type?: "json" | "text" | "html";
  };
}

/**
 * RoutePlugin的Module配置
 * 注意：配置直接平铺在 Module options 中，不使用 route 命名空间
 * 插件作者需要确保字段名不与其他插件冲突
 */
export interface RouteModuleOptions {
  routePrefix?: string; // 模块级路由前缀（使用 routePrefix 避免与其他插件的 prefix 冲突）
  routeMiddlewares?: MiddlewareHandler[]; // 模块级路由中间件（使用 routeMiddlewares 避免冲突）
}

/**
 * 错误转换函数
 * 当路由处理器抛出异常时，可以自定义错误响应格式
 * @param ctx Hono Context 对象
 * @param error 捕获到的错误对象
 * @param handler Handler 元数据，包含路由信息、方法名等
 * @returns Response 对象或可序列化的值（会被自动转换为 Response）
 */
export type ErrorTransformer = (
  ctx: Context,
  error: unknown,
  handler: HandlerMetadata
) => Response | Promise<Response>;

/**
 * RoutePlugin 配置选项
 */
export interface RoutePluginOptions {
  /**
   * 全局路径前缀（应用于所有路由）
   * 路径拼接顺序：全局前缀 + 模块前缀 + 路由路径
   * 例如：prefix="/api", routePrefix="/v1", path="/users" => "/api/v1/users"
   */
  prefix?: string;
  /**
   * 全局中间件（应用于所有路由）
   * 执行顺序：全局中间件 -> 模块级中间件 -> 路由级中间件
   * 常用于鉴权、日志等全局功能
   */
  globalMiddlewares?: MiddlewareHandler[];
  /**
   * 错误转换函数（可选）
   * 当路由处理器抛出异常时，可以自定义错误响应格式
   * 如果不提供，将使用默认的错误响应格式
   */
  errorTransformer?: ErrorTransformer;
}
