# GracefulShutdown 插件

优雅停机插件，监听系统信号并等待所有正在执行的处理器完成后才关闭。

## 注册

```typescript
// 默认 10 分钟超时
const shutdownPlugin = new GracefulShutdownPlugin();

// 自定义超时
const shutdownPlugin = new GracefulShutdownPlugin({
  shutdownTimeout: 5 * 60 * 1000, // 5 分钟
});
```

## 工作原理

1. 拦截所有 Handler，追踪活跃请求计数
2. 监听 `SIGINT`、`SIGTERM`、`SIGBREAK` 信号
3. 收到信号后：
   - 拒绝新请求（返回 "Service is shutting down"）
   - 等待活跃请求完成
   - 超时后强制停机
4. 调用 `engine.stop()` 清理资源

## 优先级

优先级为 `SYSTEM (50)`，确保：
- 包装函数在所有插件中**最先执行**（递增计数器）
- 包装函数在所有插件中**最后返回**（递减计数器）
