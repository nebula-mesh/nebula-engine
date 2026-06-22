# ClientCode 插件

自动生成类型化的客户端代码，并提供 `/client.ts` 路由供远程下载。

## 注册

```typescript
const clientCodePlugin = new ClientCodePlugin({
  clientSavePath: "./generated/client.ts", // 可选：自动保存到文件
});
```

## 自动生成

插件启动后自动收集所有 `@Action` 装饰的方法，生成类型化客户端代码。

生成的客户端可通过 `http://host:port/prefix/client.ts` 下载。

## 生成的客户端示例

```typescript
import { MicroserviceClient } from "nebula-client";

export class MyClient extends MicroserviceClient {
  public readonly users = this.registerModule({
    getUser: { idempotent: false, stream: false },
    createUser: { idempotent: false, stream: false },
  });
}

const client = new MyClient({ baseUrl: "http://localhost:3000" });
const user = await client.users.getUser("123");
// user 类型自动推导
```
