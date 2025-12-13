import {
  createMethodDecorator,
  createFieldDecorator,
  getAllMethodMetadata as getAllMetadata,
  getAllFieldMetadata,
} from "../metadata/metadata";
import { HandlerMetadata } from "./types";

/**
 * Handler装饰器元数据键（方法）
 */
const HANDLER_METADATA_KEY = Symbol.for("imean:handlerMetadata");

/**
 * Handler装饰器元数据键（属性）
 */
const HANDLER_FIELD_METADATA_KEY = Symbol.for("imean:handlerFieldMetadata");

/**
 * 创建Handler装饰器（基于通用元数据工具）
 */
const createHandlerDecorator = createMethodDecorator(HANDLER_METADATA_KEY);

/**
 * 创建Handler属性装饰器（基于通用元数据工具）
 */
const createHandlerFieldDecorator = createFieldDecorator(HANDLER_FIELD_METADATA_KEY);

/**
 * 通用Handler装饰器（支持多应用）
 * 使用最新的 Stage 3 装饰器标准
 *
 * @param config Handler配置
 * @returns 方法装饰器
 */
export function Handler<T = Record<string, any>>(config: {
  type: string;
  options?: T;
}) {
  return createHandlerDecorator({
    type: config.type,
    options: config.options || {},
  });
}

/**
 * 通用Handler属性装饰器（支持属性装饰）
 * 使用最新的 Stage 3 装饰器标准
 *
 * @param config Handler配置
 * @returns 属性装饰器
 */
export function HandlerField<T = Record<string, any>>(config: {
  type: string;
  options?: T;
}) {
  return createHandlerFieldDecorator({
    type: config.type,
    options: config.options || {},
  });
}

/**
 * 获取方法的Handler元数据列表
 */
export function getHandlerMetadata(
  target: any,
  methodName: string | symbol
): HandlerMetadata[] {
  const allMetadata = getAllMetadata(target, HANDLER_METADATA_KEY);
  const metadataList = allMetadata.get(methodName) || [];
  const prototype = target.prototype || target;

  // 转换为HandlerMetadata格式，补充method和module信息
  return metadataList.map((meta) => ({
    ...meta,
    method: prototype[methodName],
    methodName: String(methodName),
    module: prototype.constructor,
  })) as HandlerMetadata[];
}

/**
 * 获取类的所有Handler元数据
 */
export function getAllHandlerMetadata(
  target: any
): Map<string | symbol, HandlerMetadata[]> {
  const allMetadata = getAllMetadata(target, HANDLER_METADATA_KEY);
  const result = new Map<string | symbol, HandlerMetadata[]>();

  for (const [methodName, metadataList] of allMetadata.entries()) {
    result.set(methodName, metadataList as HandlerMetadata[]);
  }

  return result;
}

/**
 * 获取属性的Handler元数据列表
 */
export function getHandlerFieldMetadata(
  target: any,
  fieldName: string | symbol
): HandlerMetadata[] {
  const allMetadata = getAllFieldMetadata(target, HANDLER_FIELD_METADATA_KEY);
  const metadataList = allMetadata.get(fieldName) || [];
  const prototype = target.prototype || target;

  // 转换为HandlerMetadata格式，补充field和module信息
  return metadataList.map((meta) => ({
    ...meta,
    method: () => {}, // 属性没有 method，使用 any 绕过类型检查
    methodName: String(fieldName), // 使用 fieldName 作为 methodName
    module: prototype.constructor,
    wrap: () => {}, // 属性装饰器不使用 wrap，提供空实现
  })) as HandlerMetadata[];
}

/**
 * 获取类的所有Handler属性元数据
 */
export function getAllHandlerFieldMetadata(
  target: any
): Map<string | symbol, HandlerMetadata[]> {
  const allMetadata = getAllFieldMetadata(target, HANDLER_FIELD_METADATA_KEY);
  const result = new Map<string | symbol, HandlerMetadata[]>();

  for (const [fieldName, metadataList] of allMetadata.entries()) {
    result.set(fieldName, metadataList as HandlerMetadata[]);
  }

  return result;
}
