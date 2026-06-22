# Cache 插件

Cache 插件为方法提供缓存功能，支持可插拔的存储适配器。

## 注册

```typescript
// 默认内存缓存
const cachePlugin = new CachePlugin();

// Redis 缓存
import { RedisCacheAdapter } from "nebula-engine";
const cachePlugin = new CachePlugin(
  new RedisCacheAdapter({ client: redisClient })
);
```

## 使用

```typescript
@Module("users", { cacheDefaultTtl: 60000 }) // 模块级默认 TTL
class UserService {
  @Cache({ ttl: 5000 })      // 方法级 TTL（优先级更高）
  getUser(id: string): User {
    return { id, name: "Alice" };
  }

  @Cache({
    key: (id: string) => id,  // 自定义缓存键
  })
  getById(id: string): User {
    return { id, name: "Bob" };
  }
}
```

## 缓存键生成

默认格式：`模块名:方法名:sha256(ejson(args))`

可以自定义 `key` 函数精确控制缓存键：

```typescript
@Cache({ key: (id, version) => `${id}@${version}` })
getUser(id: string, version: number) {}
```

## 模块配置

```typescript
interface CacheModuleOptions {
  cacheEnabled?: boolean;       // 是否启用缓存（默认 true）
  cacheDefaultTtl?: number;     // 默认 TTL（ms）
  cacheCleanupInterval?: number; // 清理间隔（ms）
}
```

## 适配器接口

自定义存储只需实现 `CacheAdapter` 接口：

```typescript
interface CacheAdapter {
  get<T>(key: string): Promise<CacheItem<T> | null>;
  set<T>(key: string, item: CacheItem<T>): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
  getStats(): Promise<{ size: number; entries: any[] }>;
}
```
