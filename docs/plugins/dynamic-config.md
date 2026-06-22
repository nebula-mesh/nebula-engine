# DynamicConfig 插件

动态配置管理，支持从环境变量、etcd 或内存读取配置，属性级装饰器自动注入。

## 注册

```typescript
// 开发环境：使用内存存储
const configPlugin = new DynamicConfigPlugin();

// 生产环境：使用 etcd
const configPlugin = new DynamicConfigPlugin({
  storage: new EtcdConfigStorage({ client: etcdClient }),
});
```

## 使用

```typescript
@Module("app")
class AppService {
  @ConfigField({
    key: "max-connections",
    default: 100,
  })
  maxConnections!: number;

  @ConfigField({
    key: "feature-flags",
    default: {},
  })
  features!: Record<string, boolean>;

  doSomething() {
    console.log(this.maxConnections); // 自动注入当前值
  }
}
```

## 配置来源优先级

1. **etcd**（如果配置了 EtcdConfigStorage）
2. **环境变量**（key 转为 `UPPER_SNAKE_CASE`，如 `max-connections` → `MAX_CONNECTIONS`）
3. **默认值**（`@ConfigField` 的 `default` 参数）

## 热更新

支持监听 etcd key 变化，自动更新模块属性值，无需重启服务。
