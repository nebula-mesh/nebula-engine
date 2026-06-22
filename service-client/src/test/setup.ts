import { ActionPlugin } from "nebula-engine";
import { Factory, z } from "nebula-engine";
import { Action } from "nebula-engine";

const { Module, Microservice } = Factory.create(new ActionPlugin());

// 测试用的模块
@Module("test")
class TestModule {
  @Action({
    description: "测试普通请求",
    params: [z.string()],
    returns: z.string(),
  })
  async echo(msg: string) {
    if (msg.includes("delay")) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return msg;
  }

  @Action({
    description: "测试流式请求",
    params: [z.number()],
    returns: z.number(),
    stream: true,
  })
  async *streamNumbers(count: number) {
    if (count < 0) {
      throw new Error("Invalid count");
    }
    for (let i = 0; i < count; i++) {
      yield i;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  @Action({
    description: "测试幂等请求",
    params: [z.string()],
    returns: z.string(),
    idempotence: true,
  })
  idempotentEcho(msg: string) {
    return msg;
  }

  @Action({
    description: "测试错误处理",
    params: [z.string()],
    returns: z.string(),
  })
  error(_msg: string) {
    throw new Error("Test error");
  }

  @Action({
    description: "测试流式错误",
    params: [z.number()],
    returns: z.number(),
    stream: true,
  })
  async *streamError(count: number) {
    if (count < 0) {
      throw new Error("Invalid count");
    }
    for (let i = 0; i < count; i++) {
      if (i === count - 1) {
        throw new Error("Stream error");
      }
      yield i;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

// 创建测试服务
export function createTestService() {
  const engine = new Microservice({
    name: "test-service",
    version: "0.0.0",
    prefix: "/api",
  });
  return engine;
}
