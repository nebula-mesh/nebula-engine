/**
 * Cache Plugin - 缓存插件
 * 
 * 提供缓存功能，支持多种存储后端（内存、Redis等），支持TTL和自定义键生成器
 */

export { CachePlugin } from "./plugin";
export { Cache } from "./decorator";
export {
  CacheAdapter,
  MemoryCacheAdapter,
  RedisCacheAdapter,
} from "./adapter";
export type {
  CacheModuleOptions,
  CacheOptions,
  CacheItem,
} from "./types";
export type { RedisCacheAdapterOptions } from "./adapter";

