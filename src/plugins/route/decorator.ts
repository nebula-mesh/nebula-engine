import { Handler } from "../../core/decorators";
import { RouteOptions } from "./types";

/**
 * Route装饰器（Handler的语法糖封装）
 * 固定type="route"，简化HTTP路由标注
 * 使用最新的 Stage 3 装饰器标准
 * 
 * @example
 * ```typescript
 * @Route({ method: "GET", path: "/users" })
 * async getUsers(ctx: Context) {
 *   return ctx.json({ users: [] });
 * }
 * 
 * // 支持多个路径
 * @Route({ path: ["/", "/home", "/dashboard"] })
 * async homePage(ctx: Context) {
 *   return <HomePage />;
 * }
 * ```
 */
export function Route(options: RouteOptions) {
  return Handler({
    type: "route",
    options,
  });
}

/**
 * Page装饰器（Route的别名，用于向后兼容）
 * 专门用于页面路由，默认使用 GET 方法
 * 
 * @example
 * ```typescript
 * @Page({ path: ["/", "/home"] })
 * async adminPage(ctx: Context) {
 *   return HtmxLayout({ title: "Admin", children: <AdminLayout /> });
 * }
 * ```
 */
export function Page(options: RouteOptions) {
  // 如果没有指定 method，默认为 GET
  const pageOptions: RouteOptions = {
    method: options.method || "GET",
    ...options,
  };
  return Route(pageOptions);
}

