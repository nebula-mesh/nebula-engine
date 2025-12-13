/**
 * 启动集成测试服务的脚本
 * 用于开发阶段手动启动服务并生成客户端代码
 */

import { engine } from "./dev-service";

engine.start().then(() => {
  const port = engine.getPort();
  console.log(`\n✅ Integration test service started on port ${port}`);
  console.log(`📥 Client code available at http://localhost:${port}/api/client.ts`);
  console.log(`📁 Client code saved to: ./tests/integration/generated/client.ts\n`);
  
  // 保持进程运行
  process.on("SIGINT", async () => {
    console.log("\n🛑 Shutting down service...");
    await engine.stop();
    process.exit(0);
  });
});

