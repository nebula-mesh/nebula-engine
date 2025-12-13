/**
 * Cache装饰器配置选项
 */
export interface CacheOptions {
  /**
   * 缓存失效时间（毫秒）
   * 默认：60000 (1分钟)
   */
  ttl?: number;
  
  /**
   * 缓存键生成函数
   * 函数签名应该和处理器方法一样，接收相同的参数
   * 可以返回任意值，返回值会被 ejson 序列化后进行 hash 生成缓存键
   * 如果不提供，将使用入参（args）进行相同的计算
   * 
   * @example
   * ```typescript
   * @Cache({
   *   key: (id: string, name: string) => ({ id, name }), // 返回对象
   *   ttl: 5000
   * })
   * async getUser(id: string, name: string) {
   *   return { id, name };
   * }
   * ```
   */
  key?: (...args: any[]) => any;
  
  /**
   * 是否启用缓存
   * 默认：true
   */
  enabled?: boolean;
}

/**
 * CachePlugin的Module配置
 * 注意：配置直接平铺在 Module options 中
 */
export interface CacheModuleOptions {
  /**
   * 默认缓存失效时间（毫秒）
   * 默认：60000 (1分钟)
   */
  cacheDefaultTtl?: number;
  
  /**
   * 是否启用全局缓存
   * 默认：true
   */
  cacheEnabled?: boolean;
  
  /**
   * 缓存清理间隔（毫秒）
   * 默认：60000 (1分钟)
   */
  cacheCleanupInterval?: number;
}

/**
 * 缓存项数据结构
 */
export interface CacheItem<T = any> {
  value: T;
  expiresAt: number; // 过期时间戳
  createdAt: number; // 创建时间戳
}

