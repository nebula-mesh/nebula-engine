# Route Plugin

Route（路由）插件基于 Hono 框架提供 RESTful API 功能，支持路由注册、中间件、鉴权等能力，是构建 HTTP API 的核心插件。

## 快速开始

```typescript
import { Factory, ActionPlugin, RoutePlugin, Module, Route } from "nebula-engine";

const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  new RoutePlugin({
    prefix: "/api",
  })
);

const engine = new Microservice({
  name: "my-service",
  version: "1.0.0",
});

@Module("user")
class UserService {
  @Route({
    method: "GET",
    path: "/users/:id",
  })
  getUserById(c: any) {
    const id = c.req.param("id");
    return { id, name: "张三" };
  }
}

engine.start({ port: 3000 });
```

## 装饰器

### @Route 装饰器

定义 RESTful 路由：

```typescript
@Route({
  method: "GET",
  path: "/users",
  description: "获取用户列表",
})
getUsers(c: any) {
  return [{ id: "1", name: "张三" }];
}
```

### @Page 装饰器

简化的 GET 路由，默认方法为 GET：

```typescript
@Page({
  path: "/about",
})
aboutPage(c: any) {
  return { version: "1.0.0" };
}
```

## 装饰器选项

### RouteOptions

| 选项 | 类型 | 说明 |
|------|------|------|
| method | `HTTPMethod \| HTTPMethod[]` | HTTP 方法，默认 GET |
| path | `string \| string[]` | 路由路径 |
| middlewares | `MiddlewareHandler[]` | 路由级中间件 |
| description | `string` | 路由描述 |
| validate | `ValidateOptions` | 参数校验规则 |
| response | `{ status, type }` | 响应配置 |

## HTTP 方法

```typescript
@Route({ method: "GET", path: "/read" })
getData(c: any) { ... }

@Route({ method: "POST", path: "/create" })
createData(c: any) { ... }

@Route({ method: "PUT", path: "/update" })
updateData(c: any) { ... }

@Route({ method: "DELETE", path: "/delete/:id" })
deleteData(c: any) { ... }

@Route({ method: "PATCH", path: "/patch" })
patchData(c: any) { ... }

// 多个方法
@Route({ method: ["GET", "POST"], path: "/health" })
healthCheck(c: any) { ... }
```

## 路由路径

### 静态路径

```typescript
@Route({ path: "/users" })
getUsers(c: any) { ... }
// GET /users
```

### 路径参数

```typescript
@Route({ path: "/users/:id" })
getUser(c: any) {
  const id = c.req.param("id");
  return { id };
}
// GET /users/123
```

### 多个路径

```typescript
@Route({ path: ["/users", "/users/list"] })
getUsers(c: any) { ... }
// GET /users
// GET /users/list
```

## 中间件

### 路由级中间件

```typescript
const loggingMiddleware = async (c: any, next: any) => {
  console.log(`[${new Date().toISOString()}] ${c.req.method} ${c.req.url}`);
  await next();
};

@Route({
  path: "/users",
  middlewares: [loggingMiddleware],
})
getUsers(c: any) {
  return [];
}
```

### 模块级中间件

```typescript
@Module("user", {
  routeMiddlewares: [authMiddleware],
})
class UserService {
  @Route({ path: "/profile" })
  getProfile(c: any) { ... }

  @Route({ path: "/settings" })
  getSettings(c: any) { ... }
}
```

### 全局中间件

```typescript
new RoutePlugin({
  prefix: "/api",
  globalMiddlewares: [loggingMiddleware, authMiddleware],
})
```

### 中间件执行顺序

```
全局中间件 → 模块级中间件 → 路由级中间件 → 路由处理器
```

## 鉴权中间件

### Header Token 鉴权

```typescript
const authMiddleware = async (c: any, next: any) => {
  const token = c.req.header("Authorization");
  
  if (!token) {
    return c.json({ error: "未授权" }, 401);
  }
  
  // 验证 token
  const user = await verifyToken(token);
  if (!user) {
    return c.json({ error: "无效的 token" }, 401);
  }
  
  // 将用户信息传递给后续处理器
  c.set("user", user);
  await next();
};

@Module("admin", {
  routeMiddlewares: [authMiddleware],
})
class AdminService {
  @Route({ path: "/dashboard" })
  getDashboard(c: any) {
    const user = c.get("user");
    return { message: `欢迎, ${user.name}` };
  }
}
```

## 响应类型

Route 插件自动处理不同返回类型的 Content-Type：

| 返回类型 | Content-Type |
|----------|--------------|
| 字符串 | text/plain |
| 普通对象 | application/json |
| 数组 | application/json |
| undefined | 204 No Content |
| null | 204 No Content |
| JSX/HTML | text/html |

```typescript
@Route({ path: "/text" })
getText(c: any) {
  return "Hello World";
  // Content-Type: text/plain
}

@Route({ path: "/json" })
getJson(c: any) {
  return { message: "Hello" };
  // Content-Type: application/json
}

@Route({ path: "/html" })
getHtml(c: any) {
  return <div>Hello</div>;
  // Content-Type: text/html
}
```

## 错误处理

### 默认错误响应

```typescript
@Route({ path: "/error" })
throwError(c: any) {
  throw new Error("发生错误");
}
// 返回: { "message": "发生错误", "status": 500 }
```

### 自定义错误转换

```typescript
new RoutePlugin({
  prefix: "/api",
  errorTransformer: (c, error, handler) => {
    return c.json({
      error: {
        message: error.message,
        path: handler.path,
        method: handler.method,
        timestamp: Date.now(),
      },
    }, 500);
  },
})
```

## 完整示例

### RESTful API

```typescript
import { Factory, ActionPlugin, RoutePlugin, Module, Route } from "nebula-engine";

const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  new RoutePlugin({
    prefix: "/api",
    globalMiddlewares: [loggingMiddleware],
  })
);

const engine = new Microservice({
  name: "user-service",
  version: "1.0.0",
});

// 模拟数据存储
const users = new Map([
  ["1", { id: "1", name: "张三", email: "zhangsan@example.com" }],
]);

@Module("users", {
  routePrefix: "/v1",
  routeMiddlewares: [authMiddleware],
})
class UserService {
  @Route({
    method: "GET",
    path: "/users",
    description: "获取用户列表",
  })
  listUsers(c: any) {
    return Array.from(users.values());
  }

  @Route({
    method: "GET",
    path: "/users/:id",
    description: "获取单个用户",
  })
  getUser(c: any) {
    const id = c.req.param("id");
    const user = users.get(id);
    
    if (!user) {
      throw new Error("用户不存在");
    }
    
    return user;
  }

  @Route({
    method: "POST",
    path: "/users",
    description: "创建用户",
  })
  createUser(c: any) {
    const body = c.req.parseBody();
    const id = String(users.size + 1);
    const user = { id, ...body };
    users.set(id, user);
    return user;
  }

  @Route({
    method: "PUT",
    path: "/users/:id",
    description: "更新用户",
  })
  updateUser(c: any) {
    const id = c.req.param("id");
    const body = c.req.parseBody();
    
    if (!users.has(id)) {
      throw new Error("用户不存在");
    }
    
    const user = { id, ...body };
    users.set(id, user);
    return user;
  }

  @Route({
    method: "DELETE",
    path: "/users/:id",
    description: "删除用户",
  })
  deleteUser(c: any) {
    const id = c.req.param("id");
    users.delete(id);
    return { success: true };
  }
}

engine.start({ port: 3000 });
```

### 路由测试

```bash
# 获取用户列表
curl http://localhost:3000/api/v1/users

# 获取单个用户
curl http://localhost:3000/api/v1/users/1

# 创建用户
curl -X POST http://localhost:3000/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{"name":"李四","email":"lisi@example.com"}'

# 更新用户
curl -X PUT http://localhost:3000/api/v1/users/1 \
  -H "Content-Type: application/json" \
  -d '{"name":"张三（已更新）"}'

# 删除用户
curl -X DELETE http://localhost:3000/api/v1/users/1
```

## 注意事项

1. **方法默认 GET** - `@Page` 装饰器默认使用 GET 方法
2. **路径前缀** - 最终路径 = 全局前缀 + 模块前缀 + 路由路径
3. **中间件顺序** - 全局 → 模块级 → 路由级
4. **响应自动处理** - 不需要手动设置 Content-Type
5. **错误处理** - 使用 errorTransformer 自定义错误响应格式
