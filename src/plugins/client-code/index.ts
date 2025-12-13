/**
 * Client Code Plugin - 客户端代码生成插件
 * 
 * 提供自动生成类型化客户端代码的功能，支持服务间互调
 */

export { ClientCodePlugin } from "./plugin";
export type { ClientCodePluginOptions } from "./plugin";
export type { ModuleInfo, ActionInfo } from "./types";
export { generateClientCode, getZodTypeString } from "./generator";
export {
  convertHandlersToModuleInfo,
  convertHandlersToModuleInfoWithMetadata,
} from "./utils";

