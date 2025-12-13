import { HandlerField } from "../../core/decorators";
import type { DynamicConfigOptions } from "./types";

/**
 * Config 属性装饰器
 *
 * 标记需要动态配置的属性，使其能够从 etcd 动态读取配置值
 * ✅ 完美的 TypeScript 类型推断，无需类型断言
 *
 * @param options 动态配置选项
 * @returns 属性装饰器
 *
 * @example
 * ```typescript
 * @Module("user-service")
 * class UserService {
 *   // ✅ 使用属性装饰器，完美的类型推断
 *   @Config({
 *     key: "MAX_LOGIN_ATTEMPTS",
 *     description: "最大登录尝试次数",
 *     schema: z.number().min(1).max(10),
 *     defaultValue: 5,
 *   })
 *   maxLoginAttempts!: number;  // TypeScript 正确识别为 number
 *
 *   async login(username: string, password: string) {
 *     // ✅ 完美：直接访问，类型正确
 *     const maxAttempts = this.maxLoginAttempts;  // number 类型
 *     if (attempts > maxAttempts) {
 *       throw new Error("Too many attempts");
 *     }
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // 带变更回调
 * type FeatureFlags = {
 *   enableNewUI: boolean;
 *   enableBetaFeatures: boolean;
 * };
 *
 * @Config({
 *   key: "FEATURE_FLAGS",
 *   schema: z.object({
 *     enableNewUI: z.boolean(),
 *     enableBetaFeatures: z.boolean(),
 *   }),
 *   defaultValue: {
 *     enableNewUI: false,
 *     enableBetaFeatures: false,
 *   },
 *   onChange: async (newValue, oldValue) => {
 *     console.log("Feature flags changed:", { newValue, oldValue });
 *   },
 * })
 * featureFlags!: FeatureFlags;  // TypeScript 正确识别类型
 * ```
 *
 * @example
 * ```typescript
 * // 支持环境变量（优先级：ETCD > ENV > DEFAULT）
 * @Config({
 *   key: "MAX_CONNECTIONS",
 *   schema: z.number().min(1).max(1000),
 *   defaultValue: 100,
 * })
 * maxConnections!: number;
 *
 * // 使用时完美
 * useConnection() {
 *   const num = this.maxConnections + 10;  // ✅ 类型正确，可以直接运算
 *   const sum = this.maxConnections * 2;   // ✅ 类型正确，可以直接运算
 * }
 * ```
 */
export function Config(options: DynamicConfigOptions) {
  return HandlerField({
    type: "dynamic-config",
    options,
  });
}
