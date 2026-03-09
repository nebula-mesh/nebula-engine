# Cache Plugin

Cache 插件为 Action 方法提供缓存功能，通常与 Action 插件配合使用。

## 快速开始

```typescript
import { Factory, ActionPlugin, CachePlugin, ClientCodePlugin, Module, Action, Cache } from "nebula-engine";
import { z } from "nebula-engine";

const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  new CachePlugin(),
  new ClientCodePlugin({
    clientSavePath: "./generated/client.ts",
  })
);

const engine = new Microservice({
  name: "my-service",
  version: "1.0.0",
  prefix: "/api",
});

@Module("user")
class UserService {
  @Action({
    params: [z.string()],
    returns: z.string(),
  })
  @Cache({ ttl: 60000 }) // 缓存 1 分钟
  async getUserProfile(id: string) {
    // 模拟慢操作
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { id, name: "张三", profile: "..." };
  }
}

engine.start({ port: 3000 });
```

## 工作原理

Cache 插件会缓存 Action 方法的返回值：

1. **首次调用** - 执行真实方法，返回结果并缓存
2. **后续调用** - 直接从缓存返回，不再执行真实方法
3. **缓存过期** - 超过 TTL 后，缓存失效，重新执行方法

## 客户端使用

```typescript
import { MicroserviceClient } from "./generated/client";

const client = new MicroserviceClient({
  baseUrl: "http://localhost:3000",
  prefix: "/api",
});

// 第一次调用，耗时约 1 秒（执行真实方法 + 缓存）
let start = Date.now();
const result1 = await client.user.getUserProfile("1");
console.log(`耗时: ${Date.now() - start}ms`); // 约 1000ms

// 第二次调用，耗时约 0ms（命中缓存）
start = Date.now();
const result2 = await client.user.getUserProfile("1");
console.log(`耗时: ${Date.now() - start}ms`); // 约 0-10ms
```

## 插件配置

CachePlugin 支持两种缓存适配器：内存缓存（默认）和 Redis 缓存。

### 使用内存缓存（默认）

```typescript
import { Factory, ActionPlugin, CachePlugin } from "nebula-engine";

const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  new CachePlugin()  // 默认使用内存缓存
);
```

### 使用 Redis 缓存

对于分布式服务，可以使用 Redis 作为缓存后端：

```typescript
import { Factory, ActionPlugin, CachePlugin, RedisCacheAdapter } from "nebula-engine";
import Redis from "ioredis";

const redisClient = new Redis({
  host: "localhost",
  port: 6379,
});

const cachePlugin = new CachePlugin(
  new RedisCacheAdapter({
    client: redisClient,
    keyPrefix: "my-app:",  // 可选，默认为 "cache:"
  })
);

const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  cachePlugin
);
```

### 插件配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| adapter | `CacheAdapter` | `MemoryCacheAdapter` | 缓存适配器实例 |

## 方法级缓存配置

### TTL（过期时间）

```typescript
@Cache({ ttl: 60000 }) // 缓存 1 分钟（60000 毫秒）
async getData() { ... }

@Cache({ ttl: 5000 }) // 缓存 5 秒
async getLatestNews() { ... }

@Cache({ ttl: 3600000 }) // 缓存 1 小时
async getConfig() { ... }
```

### 自定义缓存键

默认情况下，缓存键由方法参数自动生成。你也可以自定义缓存键：

```typescript
@Action({
  params: [z.string(), z.string()],
  returns: z.string(),
})
@Cache({
  // 自定义 key 函数，返回值会被序列化为缓存键
  key: (key: string, value: string) => ({ cacheKey: `custom:${key}` }),
  ttl: 5000,
})
async getData(key: string, value: string) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return `${key}:${value}`;
}

// 调用
await client.user.getData("a", "b"); // 缓存键: custom:a
await client.user.getData("a", "c"); // 缓存键: custom:a（同样命中缓存）
```

### 模块级默认配置

可以在 Module 级别设置默认 TTL：

```typescript
@Module("user", {
  cacheDefaultTtl: 300000, // 默认缓存 5 分钟
})
class UserService {
  // 使用模块默认 TTL
  @Cache()
  async getUser() { ... }

  // 也可以覆盖默认 TTL
  @Cache({ ttl: 60000 })
  async getConfig() { ... }
}
```

## 完整示例

### 服务端定义

```typescript
import { Factory, ActionPlugin, CachePlugin, ClientCodePlugin, Module, Action, Cache } from "nebula-engine";
import { z } from "nebula-engine";

const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  new CachePlugin(),
  new ClientCodePlugin({
    clientSavePath: "./generated/client.ts",
  })
);

const engine = new Microservice({
  name: "user-service",
  version: "1.0.0",
  prefix: "/api",
});

// 模拟数据库
const users = new Map<string, { id: string; name: string; profile: string }>();

@Module("user", {
  cacheDefaultTtl: 60000, // 默认缓存 1 分钟
})
class UserService {
  /**
   * 获取用户详情 - 缓存 1 分钟
   */
  @Action({
    params: [z.string()],
    returns: z.object({
      id: z.string(),
      name: z.string(),
      profile: z.string(),
    }),
  })
  @Cache({ ttl: 60000 })
  async getUser(id: string) {
    console.log(`获取用户: ${id}`); // 仅在缓存未命中时打印
    const user = users.get(id);
    if (!user) {
      throw new Error("用户不存在");
    }
    return user;
  }

  /**
   * 获取用户列表 - 缓存 5 分钟
   */
  @Action({
    params: [],
    returns: z.array(z.object({
      id: z.string(),
      name: z.string(),
    })),
  })
  @Cache({ ttl: 300000 })
  async getUserList() {
    return Array.from(users.values()).map(u => ({
      id: u.id,
      name: u.name,
    }));
  }

  /**
   * 搜索用户 - 自定义缓存键
   */
  @Action({
    params: [z.string(), z.string().optional()],
    returns: z.array(z.object({
      id: z.string(),
      name: z.string(),
    })),
  })
  @Cache({
    // 只用第一个参数作为缓存键
    key: (query: string) => ({ cacheKey: `search:${query}` }),
    ttl: 60000,
  })
  async searchUsers(query: string, limit?: string) {
    const allUsers = Array.from(users.values());
    const results = allUsers.filter(u => u.name.includes(query));
    return results.slice(0, limit ? parseInt(limit) : undefined);
  }

  /**
   * 创建用户 - 不缓存（用于数据更新后刷新缓存）
   */
  @Action({
    params: [z.string(), z.string()],
    returns: z.object({
      id: z.string(),
      name: z.string(),
      profile: z.string(),
    }),
  })
  async createUser(name: string, profile: string) {
    const id = String(users.size + 1);
    const user = { id, name, profile };
    users.set(id, user);
    return user;
  }
}

engine.start({ port: 3000 });
```

### 客户端使用

```typescript
import { MicroserviceClient } from "./generated/client";

const client = new MicroserviceClient({
  baseUrl: "http://localhost:3000",
  prefix: "/api",
});

async function main() {
  // 创建一些用户
  await client.user.createUser("张三", "开发者");
  await client.user.createUser("李四", "设计师");

  // 首次获取用户（慢）
  console.time("first-get");
  const user1 = await client.user.getUser("1");
  console.timeEnd("first-get"); // 约 1000ms

  // 再次获取用户（快，从缓存）
  console.time("cached-get");
  const user2 = await client.user.getUser("1");
  console.timeEnd("cached-get"); // 约 0-10ms

  // 获取用户列表（缓存 5 分钟）
  const users = await client.user.getUserList();

  // 搜索用户
  const results = await client.user.searchUsers("张");
}

main();
```

## 注意事项

1. **缓存粒度** - Cache 是方法级别的缓存，按方法参数区分
2. **缓存键格式** - `模块名:方法名:参数hash`
3. **幂等方法** - 建议对只读方法使用缓存，更新数据时不使用缓存
4. **内存缓存** - 默认使用内存缓存，重启服务后缓存失效
5. **配合更新操作** - 如果需要手动清除缓存，可以在更新数据后调用无缓存的方法
