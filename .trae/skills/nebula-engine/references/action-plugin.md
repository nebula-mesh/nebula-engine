# Action Plugin

Action 插件是 Nebula Engine 的核心插件，它提供：
- 基于下标的参数传递
- zod 参数和返回值校验
- **自动生成类型化客户端 SDK**

## 快速开始

### 1. 定义服务

```typescript
import { Factory, ActionPlugin, ClientCodePlugin, Module, Action } from "nebula-engine";
import { z } from "nebula-engine";

const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
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
    description: "获取用户",
    params: [z.string()],
    returns: z.object({
      id: z.string(),
      name: z.string(),
      age: z.number(),
    }),
  })
  getUser(id: string) {
    return { id, name: "张三", age: 25 };
  }

  @Action({
    description: "创建用户",
    params: [z.string(), z.number()],
    returns: z.object({
      id: z.string(),
      name: z.string(),
      age: z.number(),
    }),
  })
  createUser(name: string, age: number) {
    return { id: "1", name, age };
  }
}

engine.start({ port: 3000 });
```

### 2. 使用自动生成的客户端 SDK

服务启动后，会自动在 `./generated/client.ts` 生成类型化客户端：

```typescript
import { MicroserviceClient } from "./generated/client";

const client = new MicroserviceClient({
  baseUrl: "http://localhost:3000",
  prefix: "/api",
});

// 调用服务就像调用本地方法一样
const user = await client.user.getUser("1");
// user: { id: "1", name: "张三", age: 25 }

const newUser = await client.user.createUser("李四", 30);
// newUser: { id: "2", name: "李四", age: 30 }
```

## 客户端调用示例

### 基本调用

```typescript
// 获取用户
const user = await client.user.getUser("1");

// 创建用户
const newUser = await client.user.createUser("王五", 28);

// 更新用户
const updated = await client.user.updateUser("1", "赵六", 35);
```

### 参数校验

客户端会自动进行参数校验：

```typescript
try {
  // 传入错误类型会抛出校验错误
  await client.user.getUser(123 as any);
} catch (error) {
  console.log(error.message); // "Expected string, got number"
}
```

### 可选参数

```typescript
@Action({
  params: [z.string(), z.string().optional()],
  returns: z.string(),
})
updateUser(name: string, nickname?: string) {
  return nickname || name;
}

// 调用
await client.user.updateUser("张三");              // 只传必需参数
await client.user.updateUser("张三", "小张");       // 传全部参数
```

### 默认参数

```typescript
@Action({
  params: [z.string().default("test"), z.number().default(1)],
  returns: z.string(),
})
greet(name: string, times: number) {
  return Array(times).fill(`Hello, ${name}`).join(", ");
}

// 调用
await client.user.greet();              // 使用默认值: "Hello, test"
await client.user.greet("李四");        // times 使用默认值 1
await client.user.greet("李四", 3);     // 全部自定义
```

### 文件上传（二进制数据）

```typescript
@Action({
  params: [z.instanceof(Uint8Array)],
  returns: z.instanceof(Uint8Array),
})
processFile(buffer: Uint8Array) {
  return new Uint8Array(buffer.reverse());
}

// 调用
const buffer = new Uint8Array([1, 2, 3, 4, 5]);
const result = await client.user.processFile(buffer);
```

### 无返回值

```typescript
@Action({
  params: [],
  returns: z.void(),
})
logMessage(message: string) {
  console.log(message);
}

// 调用
await client.user.logMessage("Hello");
```

### 流式返回

```typescript
@Action({
  params: [z.number()],
  returns: z.number(),
  stream: true,
})
streamNumbers(count: number) {
  async function* gen() {
    for (let i = 0; i < count; i++) yield i;
  }
  return gen();
}

// 调用
for await (const num of await client.user.streamNumbers(5)) {
  console.log(num); // 0, 1, 2, 3, 4
}
```

### 请求上下文

可以通过 Context 获取请求相关信息：

```typescript
import { Context } from "hono";

@Action({
  params: [],
  returns: z.string(),
})
getPath(ctx: Context) {
  return ctx.req.path;
}

// 调用
const path = await client.user.getPath(); // "/api/user/getPath"
```

## 错误处理

### 业务错误

服务抛出的错误会直接传递到客户端：

```typescript
// 服务端
@Action({
  params: [z.string()],
})
getUser(id: string) {
  const user = users.get(id);
  if (!user) {
    throw new Error("用户不存在");
  }
  return user;
}

// 客户端
try {
  await client.user.getUser("999");
} catch (error: any) {
  console.log(error.message); // "用户不存在"
}
```

### 参数校验错误

客户端会自动校验参数类型：

```typescript
try {
  await client.user.getUser(123 as any);
} catch (error: any) {
  // Zod 会抛出校验错误
  console.log(error.message);
}
```

## 幂等性

对于可以安全重试的操作，可以设置 `idempotence: true`：

```typescript
@Action({
  params: [z.string(), z.string(), z.number()],
  returns: z.object({ id: z.string() }),
  idempotence: true, // 标记为幂等操作
})
updateUser(id: string, name: string, age: number) {
  users.set(id, { id, name, age });
  return { id };
}
```

配置客户端重试策略：

```typescript
const client = new MicroserviceClient({
  baseUrl: "http://localhost:3000",
  prefix: "/api",
  retry: {
    maxRetries: 3,
    shouldRetry: (error) => error.message.includes("临时错误"),
  },
});
```

## 完整示例

### 服务端定义

```typescript
import { Factory, ActionPlugin, ClientCodePlugin, Module, Action } from "nebula-engine";
import { z } from "nebula-engine";

const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  new ClientCodePlugin({
    clientSavePath: "./generated/client.ts",
  })
);

const engine = new Microservice({
  name: "user-service",
  version: "1.0.0",
  prefix: "/api",
});

@Module("user")
class UserService {
  private users = new Map<string, { id: string; name: string; age: number }>([
    ["1", { id: "1", name: "张三", age: 25 }],
  ]);

  @Action({
    description: "获取用户",
    params: [z.string()],
    returns: z.object({
      id: z.string(),
      name: z.string(),
      age: z.number(),
    }),
  })
  getUser(id: string) {
    const user = this.users.get(id);
    if (!user) {
      throw new Error("用户不存在");
    }
    return user;
  }

  @Action({
    description: "创建用户",
    params: [z.string(), z.number()],
    returns: z.object({
      id: z.string(),
      name: z.string(),
      age: z.number(),
    }),
  })
  createUser(name: string, age: number) {
    const id = String(this.users.size + 1);
    const user = { id, name, age };
    this.users.set(id, user);
    return user;
  }

  @Action({
    description: "更新用户（幂等）",
    params: [z.string(), z.string(), z.number()],
    returns: z.object({
      id: z.string(),
      name: z.string(),
      age: z.number(),
    }),
    idempotence: true,
  })
  updateUser(id: string, name: string, age: number) {
    const user = { id, name, age };
    this.users.set(id, user);
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
  // 获取用户
  const user1 = await client.user.getUser("1");
  console.log(user1); // { id: "1", name: "张三", age: 25 }

  // 创建用户
  const newUser = await client.user.createUser("李四", 30);
  console.log(newUser); // { id: "2", name: "李四", age: 30 }

  // 更新用户（幂等操作，可以安全重试）
  const updated = await client.user.updateUser("1", "王五", 28);
  console.log(updated); // { id: "1", name: "王五", age: 28 }

  // 处理业务错误
  try {
    await client.user.getUser("999");
  } catch (error: any) {
    console.log(error.message); // "用户不存在"
  }
}

main();
```
