# Schedule Plugin

Schedule（定时任务）插件提供分布式定时任务调度功能，基于 Etcd 实现 Leader 选举，确保任务在集群中只有一个节点执行。

## 快速开始

```typescript
import { Factory, ActionPlugin, SchedulePlugin, Module, Action, Schedule, ScheduleMode } from "nebula-engine";

const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  new SchedulePlugin({
    useMockEtcd: true, // 本地开发时使用 Mock
  })
);

const engine = new Microservice({
  name: "my-service",
  version: "1.0.0",
});

@Module("task")
class TaskService {
  @Schedule({
    interval: 5000, // 每 5 秒执行一次
    mode: ScheduleMode.FIXED_RATE,
  })
  async cleanupTask() {
    console.log("执行清理任务...");
  }
}

engine.start({ port: 3000 });
```

## 工作原理

Schedule 插件使用 Etcd 的分布式锁实现 Leader 选举：

1. **Leader 选举** - 多个服务实例竞争成为 Leader
2. **只有 Leader 执行** - 确保定时任务只在主节点运行
3. **故障转移** - 当 Leader 故障时，其他节点自动接管
4. **分布式协调** - 通过 Etcd 保证任务不重复执行

## 调度模式

### FIXED_RATE（固定频率）

无论任务执行时间多长，都会按照固定间隔执行。

```typescript
@Schedule({
  interval: 5000,
  mode: ScheduleMode.FIXED_RATE,
})
async myTask() {
  // 任务执行需要 3 秒
  await doSomething(); // 耗时 3 秒
  // 下次执行：立即执行（间隔 5 秒已到）
}
```

执行时间线：
- 第 0 秒：执行任务
- 第 5 秒：执行任务（不管上次是否完成）
- 第 10 秒：执行任务

### FIXED_DELAY（固定延迟）

任务执行完成后，等待固定间隔再执行下一次。

```typescript
@Schedule({
  interval: 5000,
  mode: ScheduleMode.FIXED_DELAY,
})
async myTask() {
  // 任务执行需要 3 秒
  await doSomething(); // 耗时 3 秒
  // 下次执行：3 秒后（等待 5 秒间隔）
}
```

执行时间线：
- 第 0 秒：开始执行任务
- 第 3 秒：任务完成，等待 5 秒
- 第 8 秒：开始执行任务
- 第 11 秒：任务完成，等待 5 秒

### 默认模式

不指定 mode 时，默认使用 FIXED_RATE：

```typescript
@Schedule({
  interval: 5000, // 默认 FIXED_RATE
})
async defaultTask() {
  // ...
}
```

## 配置选项

### SchedulePlugin 选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| etcdClient | `Etcd3` | - | Etcd 客户端实例 |
| useMockEtcd | `boolean` | false | 是否使用 Mock Etcd（本地开发） |

### Schedule 装饰器选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| interval | `number` | 必填 | 执行间隔（毫秒） |
| mode | `ScheduleMode` | FIXED_RATE | 调度模式 |

## 使用场景

### 定期数据清理

```typescript
@Module("cleanup")
class CleanupService {
  @Schedule({
    interval: 3600000, // 每小时执行一次
    mode: ScheduleMode.FIXED_DELAY,
  })
  async cleanupExpiredData() {
    const expiredCount = await deleteExpiredRecords();
    console.log(`已清理 ${expiredCount} 条过期记录`);
  }
}
```

### 定期同步数据

```typescript
@Module("sync")
class SyncService {
  @Schedule({
    interval: 300000, // 每 5 分钟同步一次
    mode: ScheduleMode.FIXED_RATE,
  })
  async syncFromExternal() {
    const data = await fetchExternalData();
    await saveToDatabase(data);
    console.log("数据同步完成");
  }
}
```

### 定期发送通知

```typescript
@Module("notification")
class NotificationService {
  @Schedule({
    interval: 60000, // 每分钟检查一次
    mode: ScheduleMode.FIXED_DELAY,
  })
  async sendPendingNotifications() {
    const pending = await getPendingNotifications();
    for (const notification of pending) {
      await sendNotification(notification);
    }
  }
}
```

## 本地开发配置

### 使用 Mock Etcd

本地开发时，无需真实的 Etcd 服务：

```typescript
new SchedulePlugin({
  useMockEtcd: true,
})
```

Mock Etcd 会始终选举当前实例为 Leader，适合单机开发和测试。

### 连接真实 Etcd

生产环境连接真实 Etcd 集群：

```typescript
import { Etcd3 } from "etcd3";

const etcdClient = new Etcd3({
  hosts: ["http://etcd1:2379", "http://etcd2:2379", "http://etcd3:2379"],
});

new SchedulePlugin({
  etcdClient,
})
```

## 完整示例

### 服务端定义

```typescript
import { Factory, ActionPlugin, SchedulePlugin, Module, Action, Schedule, ScheduleMode } from "nebula-engine";
import { z } from "nebula-engine";

const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  new SchedulePlugin({
    useMockEtcd: true,
  })
);

const engine = new Microservice({
  name: "monitor-service",
  version: "1.0.0",
  prefix: "/api",
});

// 模拟数据存储
const metrics: { timestamp: number; value: number }[] = [];

@Module("monitor")
class MonitorService {
  @Schedule({
    interval: 10000, // 每 10 秒采集一次
    mode: ScheduleMode.FIXED_RATE,
  })
  async collectMetrics() {
    const metric = {
      timestamp: Date.now(),
      value: Math.random() * 100,
    };
    metrics.push(metric);
    console.log(`[${new Date().toISOString()}] 采集指标: ${metric.value.toFixed(2)}`);
  }

  @Schedule({
    interval: 60000, // 每 60 秒生成报告
    mode: ScheduleMode.FIXED_DELAY,
  })
  async generateReport() {
    if (metrics.length === 0) {
      console.log("暂无数据生成报告");
      return;
    }

    const avg = metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length;
    const max = Math.max(...metrics.map((m) => m.value));
    const min = Math.min(...metrics.map((m) => m.value));

    console.log(`=== 指标报告 ===`);
    console.log(`平均值: ${avg.toFixed(2)}`);
    console.log(`最大值: ${max.toFixed(2)}`);
    console.log(`最小值: ${min.toFixed(2)}`);

    // 保留最近的数据
    metrics.length = 0;
  }

  @Action({
    params: [],
    returns: z.array(z.object({
      timestamp: z.number(),
      value: z.number(),
    })),
  })
  getMetrics() {
    return metrics;
  }
}

engine.start({ port: 3000 });
```

### 本地运行

```bash
# 启动服务
node server.ts

# 输出示例：
# [2024-01-01T10:00:00.000Z] 采集指标: 45.23
# [2024-01-01T10:00:10.000Z] 采集指标: 67.89
# [2024-01-01T10:00:20.000Z] 采集指标: 33.12
# === 指标报告 ===
# 平均值: 48.75
# 最大值: 67.89
# 最小值: 33.12
```

## 注意事项

1. **依赖 Etcd** - 生产环境需要 Etcd 集群
2. **本地开发** - 使用 useMockEtcd: true 进行本地开发
3. **Leader 执行** - 只有 Leader 节点执行任务
4. **故障转移** - Leader 故障时自动切换
5. **模式选择** - 根据业务需求选择合适的调度模式
   - FIXED_RATE：适合实时性要求高的任务
   - FIXED_DELAY：适合耗时较长且不希望并发的任务
