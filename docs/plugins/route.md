# Route 插件

Route 插件负责注册标准 HTTP 路由，提供完整的 RESTful API 支持。

## 注册

```typescript
const routePlugin = new RoutePlugin({
  prefix: "/api",                    // 全局路径前缀
  globalMiddlewares: [authMiddleware], // 全局中间件
  errorTransformer: async (ctx, error, handler) => {
    return ctx.json({ error: error.message }, 500);
  },
});
```

## 使用

```typescript
@Module("users", {
  routePrefix: "/v1",     // 模块级前缀
  routeMiddlewares: [log], // 模块级中间件
})
class UserService {
  @Route({
    path: "/users",
    method: "GET",
    description: "获取用户列表",
  })
  getUsers(ctx: Context) {
    return [{ id: "1", name: "Alice" }];
  }

  @Route({
    path: ["/users", "/accounts"], // 多路径
    method: ["GET", "POST"],       // 多方法
  })
  handleUsers(ctx: Context) {
    // ...
  }
}
```

## 路径拼接

最终路径 = `全局前缀 + 模块前缀 + 路由路径`：

```
/api + /v1 + /users = /api/v1/users
```

## 返回值处理

Route 插件自动处理多种返回类型：

| 返回类型 | 处理方式 |
|----------|----------|
| `undefined` | 204 No Content |
| `Response` | 直接返回 |
| `string` | `text/plain` |
| `null` | 204 No Content |
| JSX 元素 | `text/html` |
| 其他对象 | `application/json` |

## 中间件

支持三层中间件（从先到后执行）：

1. **全局中间件**（插件级别）
2. **模块中间件**（`@Module` 的 `routeMiddlewares`）
3. **路由中间件**（`@Route` 的 `middlewares`）
