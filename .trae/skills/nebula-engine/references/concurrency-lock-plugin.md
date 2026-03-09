# ConcurrencyLock Plugin

ConcurrencyLock（并发锁）插件用于防止并发调用导致重复执行，通常与 Action 插件配合使用。

## 快速开始

```typescript
import { Factory, ActionPlugin, ConcurrencyLockPlugin, ClientCodePlugin, Module, Action, ConcurrencyLock } from "nebula-engine";
import { z } from "nebula-engine";

const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  new ConcurrencyLockPlugin(),
  new ClientCodePlugin({
    clientSavePath: "./generated/client.ts",
  })
);

const engine = new Microservice({
  name: "my-service",
  version: "1.0.0",
  prefix: "/api",
});

@Module("order")
class OrderService {
  @Action({
    params: [z.string()],
    returns: z.object({ orderId: z.string(), status: z.string() }),
  })
  @ConcurrencyLock({ timeout: 30000 })
  async processOrder(orderId: string) {
    // 模拟处理订单
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { orderId, status: "processed" };
  }
}

engine.start({ port: 3000 });
```

## 工作原理

ConcurrencyLock 插件确保相同参数的并发请求会按顺序执行：

1. **首次请求** - 获取锁，执行方法，释放锁
2. **并发请求** - 等待锁释放，然后按顺序执行
3. **不同参数** - 并行执行，互不阻塞

## 客户端使用

```typescript
import { MicroserviceClient } from "./generated/client";

const client = new MicroserviceClient({
  baseUrl: "http://localhost:3000",
  prefix: "/api",
});

async function main() {
  // 两个相同的请求并发执行
  const [result1, result2] = await Promise.all([
    client.order.processOrder("order-1"),
    client.order.processOrder("order-1"),
  ]);

  // 由于有并发锁，两个请求会按顺序执行
  // result1 和 result2 都会返回正确结果，不会出现重复处理
  console.log(result1); // { orderId: "order-1", status: "processed" }
  console.log(result2); // { orderId: "order-1", status: "processed" }

  // 不同参数的请求会并行执行
  const [result3, result4] = await Promise.all([
    client.order.processOrder("order-1"),
    client.order.processOrder("order-2"), // 不同参数，并行执行
  ]);
}

main();
```

## 使用场景

### 防止重复处理

```typescript
@Module("payment")
class PaymentService {
  /**
   * 处理支付 - 使用并发锁防止重复扣款
   */
  @Action({
    params: [z.string(), z.number()],
    returns: z.object({
      paymentId: z.string(),
      amount: z.number(),
      status: z.string(),
    }),
  })
  @ConcurrencyLock({ timeout: 30000 })
  async processPayment(orderId: string, amount: number) {
    // 模拟支付处理
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return {
      paymentId: `pay-${orderId}`,
      amount,
      status: "success",
    };
  }
}
```

### 库存扣减

```typescript
@Module("inventory")
class InventoryService {
  private inventory = new Map<string, number>([
    ["product-1", 100],
  ]);

  /**
   * 扣减库存 - 防止超卖
   */
  @Action({
    params: [z.string(), z.number()],
    returns: z.object({
      productId: z.string(),
      remaining: z.number(),
    }),
  })
  @ConcurrencyLock({ timeout: 10000 })
  async deductInventory(productId: string, quantity: number) {
    const current = this.inventory.get(productId) || 0;
    if (current < quantity) {
      throw new Error("库存不足");
    }
    const remaining = current - quantity;
    this.inventory.set(productId, remaining);
    return { productId, remaining };
  }
}
```

### 异步任务处理

```typescript
@Module("task")
class TaskService {
  /**
   * 处理异步任务 - 确保同一任务不会同时执行
   */
  @Action({
    params: [z.string()],
    returns: z.object({
      taskId: z.string(),
      status: z.string(),
    }),
  })
  @ConcurrencyLock({ timeout: 60000 })
  async processTask(taskId: string) {
    // 模拟长时间运行的任务
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return { taskId, status: "completed" };
  }
}
```

## 配置选项

### 装饰器配置

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| key | `(...args: any[]) => any` | 自动生成 | 自定义锁键生成函数 |
| timeout | `number` | 60000 | 锁超时时间（毫秒） |

```typescript
@ConcurrencyLock({
  key: (orderId: string) => ({ orderId }), // 自定义锁键
  timeout: 30000, // 30 秒超时
})
```

### 自定义锁键

默认情况下，锁键由方法参数自动生成：

```typescript
// 默认：所有参数都参与生成锁键
@ConcurrencyLock()
async processOrder(orderId: string, type: string) { ... }

// 自定义：只使用 orderId 作为锁键
@ConcurrencyLock({
  key: (orderId: string) => ({ orderId }),
})
async processOrder(orderId: string, type: string) { ... }

// 不同 type 的请求会被视为不同锁，可以并行
await client.order.processOrder("order-1", "normal"); // 锁键: order-1
await client.order.processOrder("order-1", "urgent"); // 锁键: order-1（相同参数，串行）
```

### 超时时间

超时时间用于防止死锁（持有锁的请求崩溃）：

```typescript
@ConcurrencyLock({ timeout: 10000 }) // 10 秒后自动释放锁
async longRunningTask(id: string) { ... }
```

## 插件配置

### 使用内存锁（默认）

```typescript
import { Factory, ActionPlugin, ConcurrencyLockPlugin } from "nebula-engine";

const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  new ConcurrencyLockPlugin()  // 默认使用内存锁
);
```

### 使用 Redis 锁（分布式）

```typescript
import { Factory, ActionPlugin, ConcurrencyLockPlugin, RedisLockAdapter } from "nebula-engine";
import Redis from "ioredis";

const redisClient = new Redis({
  host: "localhost",
  port: 6379,
});

const lockPlugin = new ConcurrencyLockPlugin(
  new RedisLockAdapter({
    client: redisClient,
    keyPrefix: "lock:",  // 可选
  })
);

const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  lockPlugin
);
```

## 完整示例

### 服务端定义

```typescript
import { Factory, ActionPlugin, ConcurrencyLockPlugin, ClientCodePlugin, Module, Action, ConcurrencyLock } from "nebula-engine";
import { z } from "nebula-engine";

const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  new ConcurrencyLockPlugin(),
  new ClientCodePlugin({
    clientSavePath: "./generated/client.ts",
  })
);

const engine = new Microservice({
  name: "order-service",
  version: "1.0.0",
  prefix: "/api",
});

// 模拟订单数据
const orders = new Map<string, { id: string; status: string }>();

@Module("order")
class OrderService {
  /**
   * 创建订单 - 防止重复创建
   */
  @Action({
    params: [z.string(), z.number()],
    returns: z.object({
      id: z.string(),
      amount: z.number(),
      status: z.string(),
    }),
  })
  @ConcurrencyLock({
    key: (userId: string, amount: number) => ({ userId, amount }),
    timeout: 30000,
  })
  async createOrder(userId: string, amount: number) {
    const id = `order-${Date.now()}`;
    const order = { id, amount, status: "created" };
    orders.set(id, order);
    return order;
  }

  /**
   * 确认订单
   */
  @Action({
    params: [z.string()],
    returns: z.object({
      id: z.string(),
      status: z.string(),
    }),
  })
  @ConcurrencyLock({ timeout: 30000 })
  async confirmOrder(orderId: string) {
    const order = orders.get(orderId);
    if (!order) {
      throw new Error("订单不存在");
    }
    order.status = "confirmed";
    return { id: orderId, status: "confirmed" };
  }

  /**
   * 获取订单状态 - 读操作不需要锁
   */
  @Action({
    params: [z.string()],
    returns: z.object({
      id: z.string(),
      status: z.string(),
    }),
  })
  async getOrder(orderId: string) {
    const order = orders.get(orderId);
    if (!order) {
      throw new Error("订单不存在");
    }
    return order;
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
  // 防止重复创建订单
  const [order1, order2] = await Promise.all([
    client.order.createOrder("user-1", 100),
    client.order.createOrder("user-1", 100),
  ]);

  console.log("订单1:", order1); // 正常创建
  console.log("订单2:", order2); // 等待订单1完成后创建

  // 确认订单
  const confirmed = await client.order.confirmOrder(order1.id);
  console.log("确认结果:", confirmed);

  // 获取订单（不需要锁）
  const order = await client.order.getOrder(order1.id);
  console.log("订单状态:", order);
}

main();
```

## 注意事项

1. **锁粒度** - 按方法参数区分，不同参数可以并行
2. **超时机制** - 建议设置合理的超时时间，防止死锁
3. **读操作不需要锁** - 只对写操作使用并发锁
4. **分布式场景** - 使用 Redis 锁实现跨进程协同
5. **性能考虑** - 锁会降低并发能力，只在必要时使用
