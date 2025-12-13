/**
 * Route Plugin - 路由插件
 *
 * 提供HTTP路由功能，支持模块级前缀和中间件
 */

export { BaseLayout, HtmxLayout } from "./components/Layout";
export {
  ServiceInfoCards,
  ServiceStatusInfo,
  ServiceStatusPage,
} from "./components/ServiceStatusPage";
export { Page, Route } from "./decorator";
export { RoutePlugin } from "./plugin";
export type {
  ErrorTransformer,
  HTTPMethod,
  RouteModuleOptions,
  RouteOptions,
  RoutePluginOptions,
} from "./types";
