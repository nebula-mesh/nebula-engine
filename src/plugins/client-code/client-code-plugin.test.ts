import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import { join } from "path";
import { Testing } from "../../core/testing";
import { Action, ActionPlugin } from "../action";
import { ClientCodePlugin } from "./plugin";
import { z } from "zod";

describe("ClientCodePlugin", () => {
  let engine: ReturnType<typeof Testing.createTestEngine>["engine"];
  let Module: ReturnType<typeof Testing.createTestEngine>["Module"];

  beforeEach(() => {
    const testEngine = Testing.createTestEngine({
      plugins: [new ActionPlugin(), new ClientCodePlugin()],
    });
    engine = testEngine.engine;
    Module = testEngine.Module;
  });

  afterEach(async () => {
    if (engine) {
      await engine.stop().catch(() => {});
    }
  });

  describe("插件配置", () => {
    it("应该有正确的插件名称", () => {
      const plugin = new ClientCodePlugin();
      expect(plugin.name).toBe("client-code-plugin");
    });

    it("应该有正确的优先级", () => {
      const plugin = new ClientCodePlugin();
      expect(plugin.priority).toBeDefined();
    });
  });

  describe("代码生成", () => {
    it("应该能够生成客户端代码", async () => {
      const UserSchema = z.object({
        id: z.string(),
        name: z.string(),
        age: z.number(),
      });

      @Module("user-service")
      class UserService {
        @Action({
          description: "创建新用户",
          params: [z.string(), z.number().min(0).max(150)],
          returns: UserSchema,
        })
        createUser(name: string, age: number) {
          return { id: "1", name, age };
        }

        @Action({
          description: "获取用户",
          params: [z.string()],
          returns: UserSchema,
        })
        getUser(id: string) {
          return { id, name: "Test", age: 25 };
        }
      }

      await engine.start();

      // 测试客户端代码路由
      const port = engine.getPort();
      const response = await fetch(
        `http://localhost:${port}/client.ts`
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/typescript");

      const code = await response.text();
      expect(code).toContain("// 这个文件是自动生成的，请不要手动修改");
      expect(code).toContain("export interface UserServiceModule");
      expect(code).toContain("createUser");
      expect(code).toContain("getUser");
      expect(code).toContain("export class MicroserviceClient");

      await engine.stop();
    });

    it("应该支持引擎 prefix", async () => {
      const testEngine = Testing.createTestEngine({
        plugins: [new ActionPlugin(), new ClientCodePlugin()],
        options: { prefix: "/api" },
      });

      // 使用返回的 Module 装饰器确保模块被正确注册
      @testEngine.Module("test-service")
      class TestService {
        @Action({
          description: "测试方法",
          params: [],
          returns: z.string(),
        })
        test() {
          return "test";
        }
      }

      await testEngine.engine.start();

      const port = testEngine.engine.getPort();
      const response = await fetch(
        `http://localhost:${port}/api/client.ts`
      );

      expect(response.status).toBe(200);
      const code = await response.text();
      expect(code).toContain("// 这个文件是自动生成的");
      expect(code).toContain("export interface TestServiceModule");
      expect(code).toContain("test:");

      await testEngine.engine.stop();
    });

    it("应该生成正确的类型定义", async () => {
      const UserSchema = z.object({
        id: z.string(),
        name: z.string(),
        age: z.number(),
      });

      @Module("user-service")
      class UserService {
        @Action({
          description: "创建用户",
          params: [
            z.string().describe("name"),
            z.number().min(0).describe("age"),
          ],
          returns: UserSchema,
        })
        createUser(name: string, age: number) {
          return { id: "1", name, age };
        }
      }

      await engine.start();

      const port = engine.getPort();
      const response = await fetch(`http://localhost:${port}/client.ts`);
      const code = await response.text();

      // 检查参数类型
      expect(code).toContain("name: string");
      expect(code).toContain("age: number");
      // 检查返回值类型
      expect(code).toContain("Promise<{");
      expect(code).toContain("id: string");
      expect(code).toContain("name: string");
      expect(code).toContain("age: number");

      await engine.stop();
    });

    it("应该支持可选参数", async () => {
      @Module("test-service")
      class TestService {
        @Action({
          description: "测试可选参数",
          params: [z.string().optional(), z.number().optional()],
          returns: z.string(),
        })
        testOptional(opt1?: string, opt2?: number) {
          return "test";
        }
      }

      await engine.start();

      const port = engine.getPort();
      const response = await fetch(`http://localhost:${port}/client.ts`);
      const code = await response.text();

      // 检查可选参数（现在使用实际的参数名称）
      expect(code).toMatch(/opt1\?: string/);
      expect(code).toMatch(/opt2\?: number/);

      await engine.stop();
    });

    it("应该支持复杂类型", async () => {
      const AddressSchema = z.object({
        street: z.string(),
        city: z.string(),
      });

      const UserSchema = z.object({
        id: z.string(),
        name: z.string(),
        address: AddressSchema,
      });

      @Module("user-service")
      class UserService {
        @Action({
          description: "创建带地址的用户",
          params: [UserSchema],
          returns: UserSchema,
        })
        createUserWithAddress(user: z.infer<typeof UserSchema>) {
          return user;
        }
      }

      await engine.start();

      const port = engine.getPort();
      const response = await fetch(`http://localhost:${port}/client.ts`);
      const code = await response.text();

      // 检查嵌套对象类型
      expect(code).toContain("address: {");
      expect(code).toContain("street: string");
      expect(code).toContain("city: string");

      await engine.stop();
    });

    it("应该支持数组类型", async () => {
      @Module("test-service")
      class TestService {
        @Action({
          description: "处理数组",
          params: [z.array(z.string())],
          returns: z.array(z.number()),
        })
        processArray(items: string[]) {
          return items.map(() => 1);
        }
      }

      await engine.start();

      const port = engine.getPort();
      const response = await fetch(`http://localhost:${port}/client.ts`);
      const code = await response.text();

      // 检查数组类型
      expect(code).toContain("string[]"); // 参数类型
      expect(code).toContain("Promise<number[]>"); // 返回值类型（返回 number[]）

      await engine.stop();
    });

    it("应该支持多个模块", async () => {
      @Module("user-service")
      class UserService {
        @Action({
          description: "创建用户",
          params: [z.string()],
          returns: z.string(),
        })
        createUser(name: string) {
          return name;
        }
      }

      @Module("order-service")
      class OrderService {
        @Action({
          description: "创建订单",
          params: [z.string()],
          returns: z.string(),
        })
        createOrder(orderId: string) {
          return orderId;
        }
      }

      await engine.start();

      const port = engine.getPort();
      const response = await fetch(`http://localhost:${port}/client.ts`);
      const code = await response.text();

      // 检查多个模块
      expect(code).toContain("export interface UserServiceModule");
      expect(code).toContain("export interface OrderServiceModule");
      expect(code).toContain("public readonly userService");
      expect(code).toContain("public readonly orderService");

      await engine.stop();
    });

    it("应该包含方法描述", async () => {
      @Module("test-service")
      class TestService {
        @Action({
          description: "这是一个测试方法",
          params: [],
          returns: z.string(),
        })
        testMethod() {
          return "test";
        }
      }

      await engine.start();

      const port = engine.getPort();
      const response = await fetch(`http://localhost:${port}/client.ts`);
      const code = await response.text();

      // 检查方法描述
      expect(code).toContain("/**");
      expect(code).toContain("这是一个测试方法");

      await engine.stop();
    });

    it("应该在没有 Action handlers 时生成空代码", async () => {
      @Module("empty-service")
      class EmptyService {
        // 没有 Action 方法
        regularMethod() {
          return "test";
        }
      }

      await engine.start();

      const port = engine.getPort();
      const response = await fetch(`http://localhost:${port}/client.ts`);
      const code = await response.text();

      // 应该只包含基础结构，没有模块定义
      expect(code).toContain("// 这个文件是自动生成的");
      expect(code).toContain("export class MicroserviceClient");

      await engine.stop();
    });
  });

  describe("路由功能", () => {
    it("应该返回正确的 Content-Type", async () => {
      @Module("test-service")
      class TestService {
        @Action({
          description: "测试",
          params: [],
          returns: z.string(),
        })
        test() {
          return "test";
        }
      }

      await engine.start();

      const port = engine.getPort();
      const response = await fetch(`http://localhost:${port}/client.ts`);

      expect(response.headers.get("content-type")).toContain("text/typescript");
      expect(response.headers.get("content-disposition")).toContain(
        'filename="client.ts"'
      );

      await engine.stop();
    });

    it("应该支持 GET 请求", async () => {
      @Module("test-service")
      class TestService {
        @Action({
          description: "测试",
          params: [],
          returns: z.string(),
        })
        test() {
          return "test";
        }
      }

      await engine.start();

      const port = engine.getPort();
      const response = await fetch(`http://localhost:${port}/client.ts`, {
        method: "GET",
      });

      expect(response.status).toBe(200);

      await engine.stop();
    });
  });

  describe("文件保存功能", () => {
    it("应该能够保存代码到指定路径", async () => {
      const savePath = join(process.cwd(), "test-generated", "client.ts");

      const testEngine = Testing.createTestEngine({
        plugins: [
          new ActionPlugin(),
          new ClientCodePlugin({ clientSavePath: savePath }),
        ],
      });

      @testEngine.Module("test-service")
      class TestService {
        @Action({
          description: "测试方法",
          params: [z.string()],
          returns: z.string(),
        })
        test(name: string) {
          return `Hello, ${name}`;
        }
      }

      await testEngine.engine.start();

      // 等待文件保存完成
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 验证文件是否存在
      const fileContent = await fs.readFile(savePath, "utf-8");
      expect(fileContent).toContain("// 这个文件是自动生成的");
      expect(fileContent).toContain("export interface TestServiceModule");
      expect(fileContent).toContain("test:");

      // 清理测试文件
      await fs.unlink(savePath).catch(() => {});
      await fs.rmdir(join(process.cwd(), "test-generated")).catch(() => {});

      await testEngine.engine.stop();
    });

    it("应该自动创建目录（如果不存在）", async () => {
      const savePath = join(
        process.cwd(),
        "test-generated",
        "nested",
        "client.ts"
      );

      const testEngine = Testing.createTestEngine({
        plugins: [
          new ActionPlugin(),
          new ClientCodePlugin({ clientSavePath: savePath }),
        ],
      });

      @testEngine.Module("test-service")
      class TestService {
        @Action({
          description: "测试方法",
          params: [],
          returns: z.string(),
        })
        test() {
          return "test";
        }
      }

      await testEngine.engine.start();

      // 等待文件保存完成
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 验证文件是否存在
      const fileContent = await fs.readFile(savePath, "utf-8");
      expect(fileContent).toContain("export interface TestServiceModule");

      // 清理测试文件和目录
      await fs.unlink(savePath).catch(() => {});
      await fs.rmdir(join(process.cwd(), "test-generated", "nested")).catch(
        () => {}
      );
      await fs.rmdir(join(process.cwd(), "test-generated")).catch(() => {});

      await testEngine.engine.stop();
    });

    it("不设置 clientSavePath 时不应该保存文件", async () => {
      const testEngine = Testing.createTestEngine({
        plugins: [new ActionPlugin(), new ClientCodePlugin()],
      });

      @testEngine.Module("test-service")
      class TestService {
        @Action({
          description: "测试方法",
          params: [],
          returns: z.string(),
        })
        test() {
          return "test";
        }
      }

      await testEngine.engine.start();

      // 验证代码仍然可以通过 HTTP 路由访问
      const port = testEngine.engine.getPort();
      const response = await fetch(`http://localhost:${port}/client.ts`);
      expect(response.status).toBe(200);

      await testEngine.engine.stop();
    });
  });
});

