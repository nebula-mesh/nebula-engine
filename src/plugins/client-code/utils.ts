import { HandlerMetadata } from "../../core/types";
import { ActionOptions } from "../action/types";
import { ModuleInfo, ActionInfo } from "./types";

/**
 * 从函数中提取参数名称
 * @param func 函数对象
 * @returns 参数名称数组
 */
function extractParamNames(func: Function): string[] {
  if (!func || typeof func !== "function") {
    return [];
  }

  try {
    // 获取函数的字符串表示
    const funcStr = func.toString();

    // 匹配函数参数部分
    // 支持以下格式：
    // function name(arg1, arg2) { ... }
    // (arg1, arg2) => { ... }
    // async function name(arg1, arg2) { ... }
    // async (arg1, arg2) => { ... }
    const match = funcStr.match(
      /(?:async\s+)?(?:function\s+\w*\s*)?\(([^)]*)\)|(?:async\s+)?\(([^)]*)\)\s*=>/
    );

    if (!match) {
      return [];
    }

    // 获取参数部分（可能是 match[1] 或 match[2]）
    const paramsStr = match[1] || match[2] || "";

    if (!paramsStr.trim()) {
      return [];
    }

    // 分割参数并清理
    return paramsStr
      .split(",")
      .map((param) => {
        // 移除注释、默认值、类型注解等
        // 例如: "arg1: string = 'default'" -> "arg1"
        // 例如: "arg2 /* comment */" -> "arg2"
        return param
          .replace(/\/\*.*?\*\//g, "") // 移除块注释
          .replace(/\/\/.*$/g, "") // 移除行注释
          .replace(/:\s*[^=,]+/g, "") // 移除类型注解
          .replace(/\s*=\s*[^,]+/g, "") // 移除默认值
          .trim();
      })
      .filter((name) => name.length > 0);
  } catch (error) {
    // 如果解析失败，返回空数组
    return [];
  }
}

/**
 * 将 HandlerMetadata 数组转换为 ModuleInfo 格式
 * @param handlers Action handlers
 * @returns 模块信息映射
 */
export function convertHandlersToModuleInfo(
  handlers: HandlerMetadata[]
): Record<string, ModuleInfo> {
  const modules: Record<string, ModuleInfo> = {};

  // 筛选出所有 type="action" 的 handlers
  const actionHandlers = handlers.filter(
    (handler) => handler.type === "action"
  );

  for (const handler of actionHandlers) {
    const actionOptions = handler.options as ActionOptions;
    const moduleClass = handler.module;
    const methodName = handler.methodName;

    // 获取模块名称（从模块元数据中获取，这里需要从引擎获取）
    // 暂时使用类名作为模块名（后续会从引擎获取真实模块名）
    const moduleName = moduleClass.name.toLowerCase().replace(/service$/, "");

    // 初始化模块信息
    if (!modules[moduleName]) {
      modules[moduleName] = {
        name: moduleName,
        actions: {},
      };
    }

    // 解析方法参数名称
    const paramNames = extractParamNames(handler.method);

    // 添加 action 信息
    modules[moduleName].actions[methodName] = {
      description: actionOptions.description,
      params: actionOptions.params || [],
      returns: actionOptions.returns,
      stream: actionOptions.stream || false,
      idempotence: actionOptions.idempotence || false,
      paramNames,
    };
  }

  return modules;
}

/**
 * 从引擎获取模块信息并转换为 ModuleInfo 格式
 * @param handlers Action handlers
 * @param getModuleMetadata 获取模块元数据的函数
 * @returns 模块信息映射
 */
export function convertHandlersToModuleInfoWithMetadata(
  handlers: HandlerMetadata[],
  getModuleMetadata: (moduleClass: any) => { name: string } | undefined
): Record<string, ModuleInfo> {
  const modules: Record<string, ModuleInfo> = {};

  // 筛选出所有 type="action" 的 handlers
  const actionHandlers = handlers.filter(
    (handler) => handler.type === "action"
  );

  for (const handler of actionHandlers) {
    const actionOptions = handler.options as ActionOptions;
    const moduleClass = handler.module;
    const methodName = handler.methodName;

    // 从引擎获取模块元数据
    const moduleMetadata = getModuleMetadata(moduleClass);
    if (!moduleMetadata) {
      continue; // 跳过没有元数据的模块
    }

    const moduleName = moduleMetadata.name;

    // 初始化模块信息
    if (!modules[moduleName]) {
      modules[moduleName] = {
        name: moduleName,
        actions: {},
      };
    }

    // 解析方法参数名称
    const paramNames = extractParamNames(handler.method);

    // 添加 action 信息
    modules[moduleName].actions[methodName] = {
      description: actionOptions.description,
      params: actionOptions.params || [],
      returns: actionOptions.returns,
      stream: actionOptions.stream || false,
      idempotence: actionOptions.idempotence || false,
      paramNames,
    };
  }

  return modules;
}

