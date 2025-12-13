/**
 * IMean ID Generator - 基于 nanoid 的 ID 生成器
 * 
 * 使用自定义字符集（仅包含大小写字母和数字）生成唯一 ID
 * 字符集：A-Z, a-z, 0-9 (共62个字符)
 * 
 * @example
 * ```typescript
 * import { imeanId } from "imean-service-engine";
 * 
 * // 生成默认长度（12）的 ID
 * const id1 = imeanId();
 * console.log(id1); // 例如: "V1StGXR8IZ5j"
 * 
 * // 生成指定长度的 ID
 * const id2 = imeanId(10);
 * console.log(id2); // 例如: "V1StGXR8IZ"
 * ```
 */

import { customAlphabet } from "nanoid";

/**
 * IMean ID 字符集
 * 仅包含大小写字母和数字（A-Z, a-z, 0-9），不包含下划线和横线
 */
const IMEAN_ID_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * IMean ID 默认长度
 * 12 个字符提供与 UUID v4 相似的碰撞概率
 */
const DEFAULT_ID_LENGTH = 12;

/**
 * 使用自定义字符集的 nanoid 生成器
 */
const generateImeanId = customAlphabet(IMEAN_ID_ALPHABET, DEFAULT_ID_LENGTH);

/**
 * 生成 IMean ID
 * 
 * @param length - ID 长度（默认 12
 * @returns 生成的 ID 字符串
 * 
 * @example
 * ```typescript
 * // 生成默认长度的 ID
 * const id1 = imeanId();
 * 
 * // 生成指定长度的 ID
 * const id2 = imeanId(10);
 * const id3 = imeanId(32);
 * ```
 */
export function imeanId(length: number = DEFAULT_ID_LENGTH): string {
  if (length <= 0) {
    throw new Error("ID length must be greater than 0");
  }
  
  // 默认长度：复用预创建的生成器（性能优化）
  if (length === DEFAULT_ID_LENGTH) {
    return generateImeanId();
  }
  
  // 自定义长度：创建新生成器
  const customLengthGenerator = customAlphabet(IMEAN_ID_ALPHABET, length);
  return customLengthGenerator();
}

/**
 * 导出字符集常量供高级用户使用
 */
export { IMEAN_ID_ALPHABET };
