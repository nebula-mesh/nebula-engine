# Action 插件

Action 插件提供基于下标的 RPC 风格参数传递、Zod 校验和自动参数注入。

## 注册

```typescript
const { Module, Microservice } = Factory.create(new ActionPlugin());
```

## 使用

```typescript
@Module("users")
class UserService {
  @Action({
    description: "创建用户",
    params: [z.string(), z.number()],      // 参数 schema
    returns: z.object({ id: z.string() }), // 返回值 schema（可选）
    stream: false,                          // 是否流式传输
  })
  createUser(name: string, age: number) {
    return { id: "xxx" };
  }
}
```

## 路由规则

Action 自动注册为 `{prefix}/{moduleName}/{methodName}`，同时支持 GET 和 POST。

- GET：从 query 参数解析
- POST：从 body 解析（EJSON 格式）

## 参数验证

参数按数组下标对齐，使用 Zod 逐一校验。支持：
- 可空参数：`z.string().nullable()`
- 嵌套对象：`z.object({ ... })`
- 类型强制转换：字符串数字自动转换为 number

## 流式传输

```typescript
@Action({ params: [z.number()], stream: true })
async *streamNumbers(count: number) {
  for (let i = 0; i < count; i++) {
    yield i;
  }
}
```

响应使用 SSE 格式，客户端通过 `AsyncIterator` 消费。

## Context 注入

如果方法第一个参数需要 Hono Context（参数数量比 schema 多 1），自动注入：

```typescript
@Action({ params: [z.string()] })
getUser(ctx: Context, id: string) {
  const token = ctx.req.header("Authorization");
  // ...
}
```
