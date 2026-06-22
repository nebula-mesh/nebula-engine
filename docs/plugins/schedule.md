# Schedule 插件

基于 etcd 的分布式定时任务调度，支持 leader 选举。

## 注册

```typescript
// 开发环境：使用内存 mock
const schedulePlugin = new SchedulePlugin({ useMockEtcd: true });

// 生产环境：连接 etcd
const schedulePlugin = new SchedulePlugin({ etcdClient });
```

## 使用

```typescript
@Module("tasks")
class TaskService {
  @Schedule({ interval: 60000, mode: "FIXED_RATE" })
  async cleanupTask() {
    // 每分钟执行一次
  }

  @Schedule({ interval: 5000, mode: "FIXED_DELAY" })
  async processQueue() {
    // 上次执行完成后等待 5 秒再执行
  }
}
```

## 执行模式

| 模式 | 行为 |
|------|------|
| `FIXED_RATE` | 固定频率，以上次**开始**时间计算 |
| `FIXED_DELAY` | 固定延迟，以上次**结束**时间计算 |

## 分布式协调

- 多个实例同时运行时，只有 **leader** 执行任务
- 基于 etcd lease 实现 leader 选举
- leader 崩溃后自动重新选举
