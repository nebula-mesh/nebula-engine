# IMean Service Engine v2

基于 Hono 的轻量级微服务引擎框架，支持插件化扩展和自动类型推断。

## 目录

- [特性](#特性)
- [快速开始](#快速开始)
- [框架概述](#框架概述)
- [核心原理](#核心原理)
- [插件系统](#插件系统)
- [内置插件](#内置插件)
  - [Action 插件](#action-插件)
  - [Route 插件](#route-插件)
  - [Cache 插件](#cache-插件)
  - [ClientCode 插件](#clientcode-插件)
  - [Schedule 插件](#schedule-插件)
  - [GracefulShutdown 插件](#gracefulshutdown-插件)
- [最佳实践](#最佳实践)
- [测试指南](#测试指南)
- [从 1.x 迁移到 2.x](#从-1x-迁移到-2x)
- [开发](#开发)

## 特性

- 🎯 **基于 Hono 的高性能 HTTP Server**：利用 Hono 的轻量级和快速特性
- 🔌 **插件化架构**：所有功能都通过插件实现，支持自定义扩展
- 🎨 **装饰器驱动的 API 定义**：使用装饰器简化代码，提高可读性
- 📝 **自动类型推断**：基于 TypeScript 和 Zod 实现完整的类型安全
- 🔄 **支持多装饰器叠加**：可以同时使用路由、缓存、限流等多个装饰器
- 🚀 **显式插件注册**：所有插件必须显式注册，避免隐式依赖
- 🛡️ **运行时类型验证**：使用 Zod 进行参数和返回值验证
- 🌊 **流式传输支持**：支持 AsyncIterator 流式数据传输
- 📦 **自动客户端生成**：自动生成类型化的客户端代码，支持服务间互调
- ⏰ **定时任务支持**：基于 etcd 的分布式定时任务调度
- 🛑 **优雅停机**：自动追踪处理器执行，支持优雅停机

## 快速开始

### 安装

```bash
npm install imean-service-engine
```

### 基本示例

```typescript
import {
  Factory,
  ActionPlugin,
  Action,
  RoutePlugin,
  Route,
  z,
} from "imean-service-engine";

// 1. 创建引擎工厂（必须显式注册所有需要的插件）
const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  new RoutePlugin()
);

// 2. 定义数据模型
const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  age: z.number(),
});
type User = z.infer<typeof UserSchema>;

// 3. 定义服务模块
@Module("users")
class UserService {
  private users = new Map<string, User>();

  @Action({
    description: "获取用户信息",
    params: [z.string()],
    returns: UserSchema,
  })
  async getUser(id: string): Promise<User> {
    const user = this.users.get(id);
    if (!user) {
      throw new Error("用户不存在");
    }
    return user;
  }

  @Route({
    method: "GET",
    path: "/health",
  })
  async health() {
    return { status: "ok" };
  }
}

// 4. 创建并启动引擎
const engine = new Microservice({
  name: "user-service",
  version: "1.0.0",
  prefix: "/api",
});

await engine.start();
console.log(`服务启动在端口 ${engine.getPort()}`);
```

## 框架概述

IMean Service Engine 是一个基于插件的微服务框架，核心设计理念是：

1. **插件化架构**：所有功能都通过插件实现，包括路由、缓存、定时任务等
2. **显式注册**：所有插件必须显式注册，不会自动包含任何默认插件
3. **类型安全**：基于 TypeScript 和 Zod 实现完整的类型推断和运行时验证
4. **装饰器驱动**：使用装饰器简化 API 定义，提高代码可读性

### 核心组件

- **Factory**：创建类型化的引擎工厂，返回 `Module` 装饰器和 `Microservice` 类
- **Microservice**：引擎核心类，管理插件生命周期和模块实例
- **Plugin**：插件接口，定义插件的生命周期钩子和优先级
- **Handler**：处理器元数据，支持通过 `wrap` API 包装方法

## 核心原理

### 工厂模式

框架使用工厂模式创建类型化的引擎实例：

```typescript
const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  new RoutePlugin()
);
```

`Factory.create` 会：
1. 合并所有插件的 Module 配置类型
2. 创建类型化的 `Module` 装饰器
3. 创建类型化的 `Microservice` 类

### 插件系统

插件系统采用**优先级驱动的洋葱圈模型**：

1. **优先级排序**：插件按优先级自动排序（数值越小，优先级越高）
2. **包装链构建**：包装插件通过 `handler.wrap()` 构建包装链
3. **路由注册**：路由插件最后执行，注册 HTTP 路由

详细说明请参考 [插件系统文档](./docs/plugin-system.md)。

### 模块发现机制

框架使用 Symbol 作为模块元数据的键，实现模块发现：

1. 每个 `Factory.create` 调用生成唯一的 Symbol
2. `Module` 装饰器使用该 Symbol 存储模块元数据
3. 引擎启动时通过 Symbol 查找所有模块

这种机制确保了不同工厂实例之间的隔离。

## 插件系统

框架的核心是插件系统，所有功能都通过插件实现。插件系统采用优先级驱动的洋葱圈模型，让用户无需关心插件注册顺序。

**详细文档请参考：[插件系统完整指南](./docs/plugin-system.md)**

### 插件优先级

```typescript
export enum PluginPriority {
  SYSTEM = 50,        // 系统级插件（优雅停机等）
  SECURITY = 100,     // 安全相关插件（限流、认证等）
  LOGGING = 200,      // 日志、监控插件
  BUSINESS = 300,     // 业务逻辑插件（默认）
  PERFORMANCE = 400,  // 性能优化插件（缓存等）
  ROUTE = 1000,       // 路由插件（必须最后执行）
}
```

### 插件生命周期

插件可以定义以下生命周期钩子：

- `onInit`：引擎初始化时调用
- `onModuleLoad`：模块加载后调用
- `onHandlerLoad`：处理器加载时调用（可以调用 `handler.wrap()`）
- `onBeforeStart`：引擎启动前调用
- `onAfterStart`：引擎启动后调用
- `onDestroy`：引擎销毁时调用

## 内置插件

### Action 插件

Action 插件用于定义 RPC 风格的 API 端点，支持参数和返回值验证。

#### 安装和注册

```typescript
import { ActionPlugin, Action } from "imean-service-engine";

const { Module, Microservice } = Factory.create(
  new ActionPlugin()
);
```

#### 基本用法

```typescript
import { z } from "imean-service-engine";

@Module("users")
class UserService {
  @Action({
    description: "创建用户",
    params: [z.string(), z.number()],
    returns: UserSchema,
  })
  async createUser(name: string, age: number): Promise<User> {
    return { id: "1", name, age };
  }
}
```

#### 特性

- **参数验证**：使用 Zod schema 验证请求参数
- **返回值验证**：使用 Zod schema 验证返回值
- **EJSON 支持**：自动处理 EJSON 序列化/反序列化，支持更多数据类型
- **流式传输**：支持 `async generator` 函数，实现流式数据传输
- **幂等性标记**：支持 `idempotence: true` 标记，用于客户端重试
- **Context 注入**：如果方法签名包含 `Context` 参数，自动注入 Hono Context

#### 流式传输示例

```typescript
@Action({
  description: "流式返回数据",
  params: [z.number()],
  returns: z.number(),
  stream: true,
})
async *streamNumbers(count: number) {
  for (let i = 0; i < count; i++) {
    yield i;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
```

#### 模块配置

```typescript
@Module("users", {
  actionMiddlewares: [
    async (ctx, next) => {
      // 模块级中间件
      await next();
    },
  ],
})
class UserService {
  @Action({
    description: "获取用户",
    params: [z.string()],
    returns: UserSchema,
    middlewares: [
      async (ctx, next) => {
        // 动作级中间件
        await next();
      },
    ],
  })
  async getUser(id: string) {}
}
```

#### ActionOptions 配置

```typescript
interface ActionOptions {
  description?: string;           // 动作描述
  params?: z.ZodTypeAny[];         // 参数验证 schema
  returns?: z.ZodTypeAny;         // 返回值验证 schema
  stream?: boolean;                // 是否流式传输
  idempotence?: boolean;           // 是否幂等操作
  middlewares?: MiddlewareHandler[]; // 动作级中间件
}
```

### Route 插件

Route 插件用于定义 HTTP 路由，支持 RESTful API 和页面路由。

#### 安装和注册

```typescript
import { RoutePlugin, Route, Page } from "imean-service-engine";

const { Module, Microservice } = Factory.create(
  new RoutePlugin()
);
```

#### 基本用法

```typescript
import { Context } from "hono";

@Module("api")
class ApiService {
  @Route({
    method: "GET",
    path: "/users/:id",
  })
  async getUser(ctx: Context) {
    const id = ctx.req.param("id");
    return ctx.json({ id, name: "John" });
  }

  @Page({
    path: "/dashboard",
  })
  async dashboard(ctx: Context) {
    return <div>Dashboard</div>;
  }
}
```

#### 特性

- **多路径支持**：支持为同一个处理器注册多个路径
- **多方法支持**：支持为同一个路径注册多个 HTTP 方法
- **中间件支持**：支持全局、模块级、路由级三层中间件
- **自动响应处理**：自动处理 `Response` 对象、JSX 元素和普通对象
- **路由描述**：支持 `description` 字段，用于文档生成

#### 中间件示例

```typescript
// 全局中间件（在 RoutePlugin 构造函数中配置）
const routePlugin = new RoutePlugin({
  globalMiddlewares: [
    async (ctx, next) => {
      // 全局鉴权中间件
      const token = ctx.req.header("Authorization");
      if (!token) {
        return ctx.json({ error: "Unauthorized" }, 401);
      }
      await next();
    },
  ],
});

// 模块级中间件
@Module("api", {
  routeMiddlewares: [
    async (ctx, next) => {
      // 模块级中间件
      await next();
    },
  ],
})
class ApiService {
  @Route({
    method: "GET",
    path: "/users",
    middlewares: [
      async (ctx, next) => {
        // 路由级中间件
        await next();
      },
    ],
  })
  async getUsers() {}
}
```

#### 多路径示例

```typescript
@Route({
  path: ["/", "/home", "/dashboard"],
  description: "首页",
})
async homePage(ctx: Context) {
  return <HomePage />;
}
```

#### RouteOptions 配置

```typescript
interface RouteOptions {
  method?: HTTPMethod | HTTPMethod[]; // HTTP 方法（默认 GET）
  path: string | string[];            // 路由路径（支持多个）
  middlewares?: MiddlewareHandler[];   // 路由级中间件
  description?: string;                 // 路由描述
}
```

### Cache 插件

Cache 插件提供方法级别的缓存功能，支持内存和 Redis 两种存储后端。

#### 安装和注册

```typescript
import {
  CachePlugin,
  Cache,
  MemoryCacheAdapter,
  RedisCacheAdapter,
} from "imean-service-engine";

// 使用内存缓存（默认）
const cachePlugin = new CachePlugin();

// 或使用 Redis 缓存
const cachePlugin = new CachePlugin(
  new RedisCacheAdapter({ client: redisClient })
);
```

#### 基本用法

```typescript
@Module("users")
class UserService {
  @Cache({ ttl: 5000 }) // 缓存 5 秒
  async getUser(id: string): Promise<User> {
    // 这个方法的结果会被缓存
    return fetchUserFromDatabase(id);
  }
}
```

#### 自定义缓存键

```typescript
@Cache({
  ttl: 5000,
  key: (id: string, name: string) => ({ id, name }), // 自定义键生成
})
async getUser(id: string, name: string): Promise<User> {
  return fetchUser(id, name);
}
```

#### 特性

- **多种存储后端**：支持内存和 Redis
- **TTL 支持**：支持设置缓存过期时间
- **自定义键生成**：支持自定义缓存键生成函数
- **自动清理**：内存缓存支持自动清理过期项
- **模块配置**：支持模块级别的默认 TTL 和启用/禁用

#### 模块配置

```typescript
@Module("users", {
  cacheDefaultTtl: 10000,      // 模块默认 TTL（10秒）
  cacheEnabled: true,          // 模块默认启用缓存
  cacheCleanupInterval: 60000, // 清理间隔（60秒）
})
class UserService {
  @Cache({ ttl: 5000 }) // 会覆盖模块默认值
  async getUser() {}
}
```

#### CacheOptions 配置

```typescript
interface CacheOptions {
  ttl?: number;                    // 缓存过期时间（毫秒，默认60000）
  key?: (...args: any[]) => any;   // 自定义键生成函数
  enabled?: boolean;                // 是否启用缓存（默认true）
}
```

#### 缓存键生成

缓存键的生成规则：
1. 如果提供了 `key` 函数，使用其返回值
2. 否则使用方法参数（args）
3. 将结果进行 ejson 序列化
4. 使用 SHA256 哈希生成最终键
5. 最终格式：`{moduleName}:{methodName}:{hash}`

示例：
```typescript
@Cache({
  key: (id: string, date: Date) => ({ id, date }), // 返回对象
  ttl: 5000,
})
async getUserData(id: string, date: Date) {
  // 缓存键：users:getUserData:{hash}
}
```

### ClientCode 插件

ClientCode 插件自动生成类型化的客户端代码，支持服务间互调。

#### 安装和注册

```typescript
import { ClientCodePlugin } from "imean-service-engine";

const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  new ClientCodePlugin({
    clientSavePath: "./generated/client.ts", // 可选：保存到本地文件
  })
);
```

#### 使用生成的客户端

1. **下载客户端代码**：访问 `http://localhost:3000/api/client.ts` 下载生成的代码
2. **使用客户端**：

```typescript
import { GeneratedClient } from "./generated/client";

const client = new GeneratedClient({
  baseUrl: "http://localhost:3000",
  prefix: "/api",
});

// 调用服务方法
const user = await client.users.getUser("123");
```

#### 特性

- **自动生成**：基于 Action 装饰器自动生成客户端代码
- **类型安全**：生成的客户端代码包含完整的类型定义
- **参数名提取**：自动提取方法参数名，生成更友好的 API
- **流式传输支持**：生成的客户端支持流式传输（AsyncIterator）
- **幂等性支持**：生成的客户端支持幂等性标记，用于自动重试
- **本地保存**：支持将生成的代码保存到本地文件，方便开发调试
- **EJSON 支持**：生成的客户端自动支持 EJSON 序列化/反序列化

#### 客户端代码示例

生成的客户端代码示例：

```typescript
export class MicroserviceClient extends BaseMicroserviceClient {
  public readonly users = this.registerModule<UsersModule>("users", {
    getUser: { stream: false, idempotent: false },
    createUser: { stream: false, idempotent: false },
  });
}

// 使用
const client = new MicroserviceClient({
  baseUrl: "http://localhost:3000",
  prefix: "/api",
});

const user = await client.users.getUser("123");
```

### Schedule 插件

Schedule 插件提供分布式定时任务功能，基于 etcd 实现主节点选举。

#### 安装和注册

```typescript
import { SchedulePlugin, Schedule } from "imean-service-engine";
import { Etcd3 } from "etcd3";

// 使用真实的 etcd
const etcdClient = new Etcd3({
  hosts: ["localhost:2379"],
});

const { Module, Microservice } = Factory.create(
  new SchedulePlugin({ etcdClient })
);

// 或使用 Mock Etcd（用于测试和本地开发）
const { Module, Microservice } = Factory.create(
  new SchedulePlugin({ useMockEtcd: true })
);
```

#### 基本用法

```typescript
@Module("tasks")
class TaskService {
  @Schedule({
    interval: 60000, // 60秒执行一次
    mode: ScheduleMode.FIXED_RATE, // 固定频率
  })
  async cleanupTask() {
    // 清理任务
  }

  @Schedule({
    interval: 5000,
    mode: ScheduleMode.FIXED_DELAY, // 固定延迟（上次执行完成后延迟）
  })
  async reportTask() {
    // 报告任务
  }
}
```

#### 特性

- **分布式调度**：基于 etcd 实现主节点选举，确保多实例中只有一个执行任务
- **两种模式**：
  - `FIXED_RATE`：固定频率，按固定间隔执行
  - `FIXED_DELAY`：固定延迟，上次执行完成后延迟指定时间再执行
- **Mock Etcd 支持**：支持使用 Mock Etcd，无需真实 etcd 服务即可开发和测试
- **OpenTelemetry 追踪**：支持 OpenTelemetry 追踪

详细文档请参考：[Schedule 插件文档](./src/plugins/schedule/README.md)

### GracefulShutdown 插件

GracefulShutdown 插件提供优雅停机功能，自动追踪处理器执行并等待完成。

#### 安装和注册

```typescript
import { GracefulShutdownPlugin } from "imean-service-engine";

const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  new RoutePlugin(),
  new GracefulShutdownPlugin({
    shutdownTimeout: 10 * 60 * 1000, // 10分钟超时（默认）
  })
);
```

#### 工作原理

1. **处理器追踪**：自动追踪所有处理器的执行状态（Action、Route、Schedule 等）
2. **信号监听**：监听 `SIGINT`、`SIGTERM`、`SIGBREAK` 等系统信号
3. **优雅停机**：
   - 收到信号后，拒绝新的请求
   - 等待所有正在执行的处理器完成
   - 如果超时，强制停机
   - 停止引擎并退出进程

#### 配置选项

```typescript
new GracefulShutdownPlugin({
  shutdownTimeout: 10 * 60 * 1000, // 停机超时时间（默认10分钟）
  enabled: true,                     // 是否启用（默认true）
})
```

#### 特性

- **自动追踪**：自动追踪所有处理器的执行状态
- **跨平台支持**：兼容 Windows、Linux、macOS
- **超时保护**：支持设置停机超时时间，防止无限等待
- **拒绝新请求**：停机期间自动拒绝新的请求

## 最佳实践

### 1. 插件注册顺序

虽然插件系统会自动按优先级排序，但建议按功能分组注册插件：

```typescript
const { Module, Microservice } = Factory.create(
  // 系统插件
  new GracefulShutdownPlugin(),
  
  // 业务插件
  new ActionPlugin(),
  new RoutePlugin(),
  
  // 性能插件
  new CachePlugin(),
  
  // 工具插件
  new ClientCodePlugin(),
  new SchedulePlugin({ useMockEtcd: true }),
);
```

### 2. 模块组织

建议按功能模块组织代码：

```typescript
// services/user-service.ts
@Module("users")
class UserService {
  @Action({ ... })
  async getUser() {}
}

// services/order-service.ts
@Module("orders")
class OrderService {
  @Action({ ... })
  async getOrder() {}
}
```

### 3. 类型定义

使用 Zod schema 定义数据类型，实现类型安全和运行时验证：

```typescript
import { z } from "imean-service-engine";

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  age: z.number().min(0).max(150),
});

type User = z.infer<typeof UserSchema>;
```

### 4. 错误处理

在 Action 方法中抛出错误，框架会自动处理：

```typescript
@Action({
  params: [z.string()],
  returns: UserSchema,
})
async getUser(id: string): Promise<User> {
  const user = await db.findUser(id);
  if (!user) {
    throw new Error("用户不存在"); // 框架会自动返回错误响应
  }
  return user;
}
```

### 5. 中间件使用

合理使用中间件实现横切关注点：

```typescript
// 认证中间件
const authMiddleware = async (ctx: Context, next: () => Promise<void>) => {
  const token = ctx.req.header("Authorization");
  if (!token) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }
  // 验证 token 并注入用户信息
  ctx.set("user", { id: "123", name: "John" });
  await next();
};

// 在 RoutePlugin 中配置全局中间件
const routePlugin = new RoutePlugin({
  globalMiddlewares: [authMiddleware],
});
```

### 6. 缓存策略

合理使用缓存提高性能：

```typescript
// 频繁查询但变化不频繁的数据
@Cache({ ttl: 5 * 60 * 1000 }) // 缓存 5 分钟
async getConfig(): Promise<Config> {
  return db.findConfig();
}

// 使用自定义键避免缓存冲突
@Cache({
  ttl: 60000,
  key: (userId: string, type: string) => ({ userId, type }),
})
async getUserData(userId: string, type: string) {
  return db.findUserData(userId, type);
}
```

### 7. 版本路由

引擎启动后会自动注册版本路由 `{prefix}/version`（如果路径未被占用），用于健康检查：

```typescript
// 访问 http://localhost:3000/api/version
// 返回：
{
  "name": "user-service",
  "version": "1.0.0",
  "status": "running"
}
```

### 8. 预检机制

框架提供了预检机制，用于在服务启动前进行必要的检查和初始化（如数据库连接、Redis 连接等）：

```typescript
import { startCheck, PreStartChecker } from "imean-service-engine";

// 定义预检项
const checkers: PreStartChecker[] = [
  {
    name: "数据库连接检查",
    check: async () => {
      const db = await connectDB();
      await db.ping();
    },
  },
  {
    name: "Redis 连接检查",
    check: async () => {
      const redis = await connectRedis();
      await redis.ping();
    },
  },
  {
    name: "可选检查项",
    check: async () => {
      // 某些检查
    },
    skip: true, // 可以跳过某些检查
  },
];

// 执行预检并启动服务
await startCheck(checkers, async () => {
  const { Module, Microservice } = Factory.create(
    new ActionPlugin(),
    new RoutePlugin()
  );

  const engine = new Microservice({
    name: "user-service",
    version: "1.0.0",
  });

  await engine.start();
  console.log(`服务启动在端口 ${engine.getPort()}`);
});
```

预检机制的优势：
- **依赖检查**：确保所有必要的外部服务都可用
- **优雅失败**：如果检查失败，服务不会启动
- **清晰日志**：提供详细的检查日志，便于问题诊断
- **可选检查**：支持跳过某些非必需的检查项

## 测试指南

框架提供了两种测试方法，根据测试场景选择合适的测试方式，可以避免不必要的 HTTP 服务器启动，提高测试效率。

### `engine.handler` - 用于不依赖 Hono 的场景

**适用场景**：
- Action 插件测试（不涉及 Hono 中间件）
- Cache 插件测试
- 其他不依赖 HTTP 层的插件测试
- 测试远程 RPC 调用逻辑

**优势**：
- 无需启动 HTTP 服务器，测试更快
- 更符合 RPC 调用的语义
- 完整的类型推导支持（自动推导参数和返回值类型）
- 自动执行包装链（缓存、限流等）

**使用示例**：

```typescript
import { Testing } from "../../core/testing";
import { ActionPlugin, Action } from "./index";
import { z } from "zod";

describe("ActionPlugin", () => {
  let engine: ReturnType<typeof Testing.createTestEngine>["engine"];
  let Module: ReturnType<typeof Testing.createTestEngine>["Module"];

  beforeEach(() => {
    const testEngine = Testing.createTestEngine({
      plugins: [new ActionPlugin()],
    });
    engine = testEngine.engine;
    Module = testEngine.Module;
  });

  it("应该能够调用 Action handler", async () => {
    @Module("users")
    class UserService {
      @Action({ params: [z.string()] })
      getUser(id: string): { id: string; name: string } {
        return { id, name: "Alice" };
      }
    }

    // 获取 handler 并调用（类型自动推导）
    const getUserHandler = engine.handler(UserService, "getUser");
    const result = await getUserHandler("123");
    // result 的类型自动推导为 { id: string; name: string }
    expect(result).toEqual({ id: "123", name: "Alice" });

    // 或者链式调用
    const result2 = await engine.handler(UserService, "getUser")("456");
    expect(result2).toEqual({ id: "456", name: "Alice" });
  });
});
```

### `engine.request` - 用于依赖 Hono 的场景

**适用场景**：
- Route 插件测试（需要测试路由、中间件、Context 等）
- 需要测试完整 HTTP 请求/响应流程的场景
- 需要测试 Hono 中间件的场景

**优势**：
- 完整执行 Hono 中间件链
- 支持所有 HTTP 方法和请求选项
- 返回标准 `Response` 对象
- 无需启动 HTTP 服务器

**使用示例**：

```typescript
import { Testing } from "../../core/testing";
import { RoutePlugin, Route } from "./index";
import { Context } from "hono";

describe("RoutePlugin", () => {
  let engine: ReturnType<typeof Testing.createTestEngine>["engine"];
  let Module: ReturnType<typeof Testing.createTestEngine>["Module"];

  beforeEach(() => {
    const testEngine = Testing.createTestEngine({
      plugins: [new RoutePlugin()],
    });
    engine = testEngine.engine;
    Module = testEngine.Module;
  });

  it("应该能够调用 Route handler", async () => {
    @Module("users")
    class UserService {
      @Route({ path: "/users/:id" })
      getUser(ctx: Context) {
        const id = ctx.req.param("id");
        return { id, name: "Alice" };
      }
    }

    // 使用 request 方法（完整执行中间件）
    const response = await engine.request("/users/123");
    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data).toEqual({ id: "123", name: "Alice" });

    // 使用 Request 对象
    const request = new Request("http://localhost/users/456", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Bob" }),
    });
    const response2 = await engine.request(request);
    expect(response2.ok).toBe(true);
  });
});
```

### 选择指南

| 场景 | 使用方法 | 原因 |
|------|---------|------|
| Action 插件测试 | `engine.handler` | 不依赖 Hono，表示 RPC 调用 |
| Route 插件测试 | `engine.request` | 需要测试路由和中间件 |
| Cache 插件测试 | `engine.handler` | 不依赖 Hono，测试包装链 |
| 中间件测试 | `engine.request` | 需要完整执行中间件链 |
| 集成测试 | `fetch` + `engine.start()` | 需要真实 HTTP 服务器 |

### 注意事项

1. **集成测试**：应使用 `fetch` + `engine.start()` 启动真实 HTTP 服务器，确保测试场景接近生产环境
2. **特定测试**：`engine.test.ts` 中的特定测试可能故意设计为测试特定功能，保持原有方式
3. **避免混用**：在同一测试文件中保持一致的测试方法
4. **类型推导**：`engine.handler` 支持完整的类型推导，无需显式指定泛型参数

## 从 1.x 迁移到 2.x

### 主要变化

#### 1. 插件系统重构

**1.x 版本**：
- 使用 `new Microservice({ modules: [...], plugins: [...] })` 创建引擎
- 某些插件（如 RoutePlugin）作为默认插件自动包含

**2.x 版本**：
- 使用 `Factory.create(...plugins)` 创建引擎工厂
- **所有插件都必须显式注册**，不再有默认插件

```typescript
// 1.x
const service = new Microservice({
  modules: [UserService],
  plugins: [new CachePlugin()],
});

// 2.x
const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  new RoutePlugin(),
  new CachePlugin()
);
const engine = new Microservice({
  name: "user-service",
  version: "1.0.0",
});
```

#### 2. 模块定义方式变化

**1.x 版本**：
```typescript
@Module("users", {
  description: "用户服务模块",
  version: "1.0.0",
})
class UserService {}
```

**2.x 版本**：
```typescript
// Module 装饰器由 Factory.create 返回
const { Module } = Factory.create(...plugins);

@Module("users", {
  // 插件配置直接平铺在 options 中
  cacheDefaultTtl: 5000,
  routePrefix: "/api/v1",
})
class UserService {}
```

#### 3. Action 装饰器变化

**1.x 版本**：
```typescript
@Action({
  cache: true,
  cacheTTL: 60,
})
async getUser() {}
```

**2.x 版本**：
```typescript
// 缓存功能独立为 Cache 插件
@Action({ ... })
@Cache({ ttl: 60000 })
async getUser() {}
```

#### 4. Page 装饰器变化

**1.x 版本**：
- `Page` 装饰器需要 `PageRenderPlugin`

**2.x 版本**：
- `Page` 装饰器是 `Route` 的别名，由 `RoutePlugin` 提供
- 不再需要单独的 `PageRenderPlugin`

```typescript
// 1.x
import { Page, PageRenderPlugin } from "imean-service-engine";
const service = new Microservice({
  plugins: [new PageRenderPlugin()],
});

// 2.x
import { RoutePlugin, Page } from "imean-service-engine";
const { Module } = Factory.create(new RoutePlugin());
```

#### 5. 客户端生成变化

**1.x 版本**：
```typescript
const service = new Microservice({
  generateClient: new URL("./client.ts", import.meta.url),
});
```

**2.x 版本**：
```typescript
const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  new ClientCodePlugin({
    clientSavePath: "./generated/client.ts", // 可选
  })
);
// 客户端代码自动在 {prefix}/client.ts 提供下载
```

#### 6. 启动方式变化

**1.x 版本**：
```typescript
const service = new Microservice({ ... });
await service.init();
service.start(3000);
```

**2.x 版本**：
```typescript
const engine = new Microservice({ ... });
const port = await engine.start(); // 返回实际使用的端口
// 或指定端口
const port = await engine.start(3000);
```

#### 7. 已移除的功能

以下功能在 2.x 版本中已被移除：

- **WebSocket 支持**：1.x 版本中的 WebSocket 功能已移除
- **startCheck**：启动前检查功能已整合到主包，可以直接从 `imean-service-engine` 导入
- **内置 PageRenderPlugin**：页面渲染功能已整合到 RoutePlugin 中

### 迁移步骤

1. **更新依赖**：
   ```bash
   npm install imean-service-engine@^2.0.0
   ```

2. **重构引擎创建**：
   ```typescript
   // 旧代码
   const service = new Microservice({
     modules: [UserService],
     plugins: [new CachePlugin()],
   });
   
   // 新代码
   const { Module, Microservice } = Factory.create(
     new ActionPlugin(),
     new RoutePlugin(),
     new CachePlugin()
   );
   const engine = new Microservice({
     name: "user-service",
     version: "1.0.0",
   });
   ```

3. **更新模块定义**：
   ```typescript
   // 确保使用 Factory.create 返回的 Module
   const { Module } = Factory.create(...plugins);
   
   @Module("users")
   class UserService {}
   ```

4. **分离缓存装饰器**：
   ```typescript
   // 旧代码
   @Action({ cache: true, cacheTTL: 60 })
   
   // 新代码
   @Action({ ... })
   @Cache({ ttl: 60000 })
   ```

5. **更新客户端生成**：
   ```typescript
   // 添加 ClientCodePlugin
   const { Module, Microservice } = Factory.create(
     new ActionPlugin(),
     new ClientCodePlugin()
   );
   ```

6. **更新启动代码**：
   ```typescript
   // 旧代码
   await service.init();
   service.start(3000);
   
   // 新代码
   const port = await engine.start(3000);
   ```

### 兼容性说明

- **装饰器 API**：`@Action`、`@Route`、`@Cache` 等装饰器的 API 基本保持不变
- **类型系统**：类型推断机制保持不变，但需要显式注册插件
- **中间件系统**：中间件 API 保持不变，但配置方式有所变化

## 开发

### 项目结构

```
src/
  core/           # 核心框架代码
    factory.ts    # 工厂类
    engine.ts     # 引擎核心
    types.ts      # 类型定义
    decorators.ts # 装饰器实现
  plugins/        # 插件实现
    action/       # Action 插件
    route/        # Route 插件
    cache/        # Cache 插件
    client-code/  # ClientCode 插件
    schedule/     # Schedule 插件
    graceful-shutdown/ # GracefulShutdown 插件
  index.ts        # 入口文件
```

### 开发命令

```bash
# 安装依赖
npm install

# 运行测试
npm test

# 编译
npm run build

# 开发模式（启动集成测试服务）
npm run dev
```

### 贡献指南

欢迎提交 Issue 和 Pull Request！

## License

MIT
