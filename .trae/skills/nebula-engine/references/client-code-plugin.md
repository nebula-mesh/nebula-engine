# ClientCode Plugin

ClientCode 插件自动为服务生成类型化的客户端 SDK，让用户可以像调用本地方法一样调用远程服务。

## 快速开始

```typescript
import { Factory, ActionPlugin, ClientCodePlugin, Module, Action } from "nebula-engine";
import { z } from "nebula-engine";

const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  new ClientCodePlugin({
    clientSavePath: "./generated/client.ts", // 自动保存到文件
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
}

engine.start({ port: 3000 });
```

## 工作原理

ClientCode 插件会在服务启动后：

1. **收集所有 Action** - 扫描所有带 `@Action` 装饰器的方法
2. **生成客户端代码** - 根据 Action 的参数和返回值生成 TypeScript 代码
3. **提供下载** - 注册 `/client.ts` 路由供下载
4. **自动保存** - 如果配置了 `clientSavePath`，会自动保存到文件

## 获取客户端代码

### 方式一：自动保存到文件

配置 `clientSavePath` 后，服务启动时自动生成并保存：

```typescript
new ClientCodePlugin({
  clientSavePath: "./generated/client.ts",
})
```

启动服务后，会在指定路径生成 `client.ts` 文件。

### 方式二：HTTP 下载

服务启动后，可以通过 HTTP 获取客户端代码：

```bash
# 默认路径
curl http://localhost:3000/client.ts

# 如果配置了 prefix
curl http://localhost:3000/api/client.ts
```

## 使用生成的客户端

### 基本使用

```typescript
import { MicroserviceClient } from "./generated/client";

const client = new MicroserviceClient({
  baseUrl: "http://localhost:3000",
  prefix: "/api",
});

// 调用服务方法
const user = await client.user.getUser("1");
// user: { id: "1", name: "张三", age: 25 }
```

### 模块化调用

客户端按模块组织方法：

```typescript
// 调用 user 模块的方法
const user = await client.user.getUser("1");

// 调用 order 模块的方法
const order = await client.order.getOrder("order-1");

// 调用 product 模块的方法
const products = await client.product.listProducts();
```

## 客户端配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| baseUrl | `string` | 必填 | 服务基础 URL |
| prefix | `string` | "" | API 前缀 |
| retry | `RetryOptions` | - | 重试配置 |

### 重试配置

```typescript
const client = new MicroserviceClient({
  baseUrl: "http://localhost:3000",
  prefix: "/api",
  retry: {
    maxRetries: 3,
    shouldRetry: (error) => {
      // 根据错误类型判断是否重试
      return error.message.includes("网络错误") ||
             error.message.includes("超时");
    },
  },
});
```

## 支持的类型

ClientCode 插件生成的客户端支持丰富的类型：

### 基础类型

```typescript
@Action({
  params: [
    z.string(),
    z.number(),
    z.boolean(),
  ],
  returns: z.object({
    str: z.string(),
    num: z.number(),
    bool: z.boolean(),
  }),
})
processBasicTypes(str: string, num: number, bool: boolean) {
  return { str, num, bool };
}
```

生成的客户端代码：
```typescript
processBasicTypes: (
  str: string,
  num: number,
  bool: boolean,
) => Promise<{ str: string; num: number; bool: boolean }>;
```

### 可选参数

```typescript
@Action({
  params: [
    z.string(),
    z.number().optional(),
    z.string().optional(),
  ],
  returns: z.string(),
})
updateUser(
  id: string,
  name?: number,
  email?: string
) {
  return id;
}
```

生成的客户端代码：
```typescript
updateUser: (
  id: string,
  name?: number,
  email?: string,
) => Promise<string>;
```

### 复杂对象

```typescript
const AddressSchema = z.object({
  street: z.string(),
  city: z.string(),
  zipCode: z.string(),
});

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: AddressSchema,
});

@Action({
  params: [UserSchema],
  returns: UserSchema,
})
createUser(user: z.infer<typeof UserSchema>) {
  return user;
}
```

生成的客户端代码：
```typescript
createUser: (
  user: {
    id: string;
    name: string;
    address: {
      street: string;
      city: string;
      zipCode: string;
    };
  },
) => Promise<{
  id: string;
  name: string;
  address: {
    street: string;
    city: string;
    zipCode: string;
  };
}>;
```

### 数组类型

```typescript
@Action({
  params: [z.array(z.string())],
  returns: z.array(z.object({
    id: z.string(),
    name: z.string(),
  }))],
})
processItems(items: string[]) {
  return items.map(id => ({ id, name: "test" }));
}
```

### 流式返回

```typescript
@Action({
  params: [z.number()],
  returns: z.number(),
  stream: true,
})
async *streamData(count: number) {
  for (let i = 0; i < count; i++) {
    yield i;
  }
}
```

生成的客户端代码：
```typescript
streamData: (count: number) => Promise<AsyncIterable<number>>;

// 使用
for await (const num of await client.service.streamData(10)) {
  console.log(num);
}
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
    description: "列出所有用户",
    params: [],
    returns: z.array(z.object({
      id: z.string(),
      name: z.string(),
      age: z.number(),
    })),
  })
  listUsers() {
    return Array.from(this.users.values());
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
  retry: {
    maxRetries: 3,
    shouldRetry: (error) => error.message.includes("临时错误"),
  },
});

async function main() {
  // 获取用户
  try {
    const user = await client.user.getUser("1");
    console.log(user); // { id: "1", name: "张三", age: 25 }
  } catch (error: any) {
    console.log(error.message); // "用户不存在"
  }

  // 创建用户
  const newUser = await client.user.createUser("李四", 30);
  console.log(newUser); // { id: "2", name: "李四", age: 30 }

  // 列出所有用户
  const users = await client.user.listUsers();
  console.log(users); // [{ id: "1", ... }, { id: "2", ... }]
}

main();
```

### 生成的文件内容示例

生成的 `client.ts` 大致如下：

```typescript
// 这个文件是自动生成的，请不要手动修改

import { MicroserviceClient as BaseMicroserviceClient } from "imean-service-client";
export * from "imean-service-client";

export interface UserModule {
  getUser: (id: string) => Promise<{ id: string; name: string; age: number }>;
  createUser: (name: string, age: number) => Promise<{ id: string; name: string; age: number }>;
  listUsers: () => Promise<{ id: string; name: string; age: number }[]>;
}

export class MicroserviceClient extends BaseMicroserviceClient {
  constructor(options: any) {
    super(options);
  }

  public readonly user = this.registerModule<UserModule>("user", {
    getUser: { idempotent: false, stream: false },
    createUser: { idempotent: false, stream: false },
    listUsers: { idempotent: false, stream: false },
  });
}
```

## 注意事项

1. **自动生成** - 服务启动后客户端代码自动生成
2. **类型安全** - 生成的代码是完全类型化的
3. **方法描述** - Action 的 `description` 会作为 JSDoc 注释保留
4. **幂等性标记** - 根据 `idempotence` 配置自动标记方法
5. **流式支持** - 带 `stream: true` 的 Action 会生成 `AsyncIterable` 类型
