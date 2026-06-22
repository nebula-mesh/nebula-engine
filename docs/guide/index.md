# 快速开始

## 安装

```bash
npm install nebula-engine
```

## 基本示例

```typescript
import {
  Factory,
  ActionPlugin,
  Action,
  RoutePlugin,
  Route,
  z,
} from "nebula-engine";

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

// 3. 定义服务模块
@Module("users")
class UserService {
  private users = new Map<string, User>();

  @Action({
    description: "获取用户信息",
    params: [z.string()],
    returns: UserSchema,
  })
  getUser(id: string): User | undefined {
    return this.users.get(id);
  }

  @Route({ path: "/health", method: "GET" })
  health() {
    return { status: "ok" };
  }
}

// 4. 创建并启动引擎
const engine = new Microservice({
  name: "my-service",
  version: "1.0.0",
});

await engine.start(3000);
```

## 核心概念

### Factory

`Factory.create()` 是创建引擎的唯一入口。所有插件必须显式传入：

```typescript
const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  new RoutePlugin(),
  new CachePlugin()
);
```

`Module` 是一个类型化的装饰器，用于声明模块。`Microservice` 是一个类型化的引擎类。

### Module

模块是服务的组织单元。使用 `@Module(name)` 装饰器声明：

```typescript
@Module("users")
class UserService {
  // ...
}
```

### Action 和 Route

两种方式暴露 API：

- `@Action` — RPC 风格，基于下标传参，自动 Zod 校验
- `@Route` — RESTful 风格，直接操作 Hono Context

```typescript
class UserService {
  @Action({ params: [z.string()], returns: UserSchema })
  getUser(id: string): User { /* ... */ }

  @Route({ path: "/users/:id", method: "GET" })
  getUserRoute(ctx: Context) { /* ... */ }
}
```
