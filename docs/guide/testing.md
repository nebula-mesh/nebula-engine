# 测试指南

## 测试辅助工具

Nebula Engine 提供 `Testing.createTestEngine()` 快速创建测试引擎：

```typescript
import { Testing } from "nebula-engine";

const { engine, Module } = Testing.createTestEngine({
  plugins: [new ActionPlugin(), new RoutePlugin()],
});
```

## 两种测试模式

### engine.handler() — RPC 风格测试

适用于 Action 插件测试，无需启动 HTTP 服务器：

```typescript
@Module("users")
class UserService {
  @Action({ params: [z.string()] })
  getUser(id: string) {
    return { id, name: "Alice" };
  }
}

const getUserHandler = engine.handler(UserService, "getUser");
const result = await getUserHandler("123");
// result 类型自动推导
```

### engine.request() — HTTP 风格测试

适用于 Route 插件测试，完整执行中间件链：

```typescript
@Module("users")
class UserService {
  @Route({ path: "/users/:id" })
  getUser(ctx: Context) {
    return { id: ctx.req.param("id"), name: "Alice" };
  }
}

const response = await engine.request("/users/123");
const data = await response.json();
```

### 集成测试

需要真实 HTTP 服务器时，使用随机端口：

```typescript
const port = await engine.start(0); // 随机端口
const response = await fetch(`http://127.0.0.1:${port}/api/users/123`);
await engine.stop();
```

## 端口使用规范

测试中**必须使用随机端口 `0`** 避免冲突：

```typescript
// ✅ 正确
const port = await engine.start(0);

// ❌ 错误
const port = await engine.start(3000);
```

## 测试方法选择指南

| 场景 | 使用方法 | 原因 |
|------|---------|------|
| Action 测试 | `engine.handler` | 不依赖 Hono，表示 RPC 调用 |
| Cache 测试 | `engine.handler` | 测试包装链，无需 HTTP |
| Route 测试 | `engine.request` | 需要测试路由和中间件 |
| 中间件测试 | `engine.request` | 需要完整执行中间件链 |
| 集成测试 | `fetch` + `engine.start(0)` | 真实 HTTP 服务器 |
