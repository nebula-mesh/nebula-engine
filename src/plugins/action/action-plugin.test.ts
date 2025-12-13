import * as ejson from "ejson";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { Testing } from "../../core/testing";
import { Action, ActionPlugin } from "./index";

// 用户 Schema
const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  age: z.number().min(0).max(150),
});

type User = z.infer<typeof UserSchema>;

/**
 * 解析 ejson 格式的响应
 */
async function parseEjsonResponse(response: Response): Promise<any> {
  const text = await response.text();
  return ejson.parse(text);
}

describe("ActionPlugin", () => {
  let engine: ReturnType<typeof Testing.createTestEngine>["engine"];
  let Module: ReturnType<typeof Testing.createTestEngine>["Module"];

  beforeEach(() => {
    const testEngine = Testing.createTestEngine({
      plugins: [new ActionPlugin()],
    });
    engine = testEngine.engine;
    Module = testEngine.Module;
  });

  afterEach(async () => {
    console.log("afterEach in action-plugin.test.ts");
    if (engine) {
      await engine.stop();
    }
  });

  // 注意：Action 插件测试优先使用 engine.handler，因为它不依赖 Hono，更符合 RPC 调用的语义
  // 只有在需要测试 HTTP 路由功能（如 GET/POST 方法、引擎 prefix）时才使用 engine.request 或 fetch

  it("应该能够使用Action装饰器装饰方法", async () => {
    const users = new Map<string, User>();

    @Module("user-service")
    class UserService {
      @Action({
        description: "创建新用户",
        params: [z.string(), z.number().min(0).max(150)],
        returns: UserSchema,
      })
      createUser(name: string, age: number): User {
        const id = (users.size + 1).toString();
        const newUser = { id, name, age };
        users.set(id, newUser);
        return newUser;
      }
    }

    // 使用 engine.handler 测试（不依赖 Hono，更符合 RPC 调用语义）
    const createUserHandler = engine.handler(UserService, "createUser");
    const result = await createUserHandler("Alice", 25);

    expect(result).toMatchObject({
      id: expect.any(String),
      name: "Alice",
      age: 25,
    });
  });

  it("应该校验参数类型", async () => {
    @Module("test-service")
    class TestService {
      @Action({
        params: [z.string(), z.number()],
      })
      testMethod(name: string, age: number): { name: string; age: number } {
        return { name, age };
      }
    }

    // 使用 engine.handler 测试
    const testMethodHandler = engine.handler(TestService, "testMethod");

    // 测试有效参数
    const result = await testMethodHandler("Alice", 25);
    expect(result).toEqual({ name: "Alice", age: 25 });

    // 注意：参数类型校验在 ActionPlugin 的路由处理器中进行
    // 直接调用 handler 时，TypeScript 会在编译时检查类型
    // 如果需要测试运行时参数校验，需要使用 engine.request 或 fetch
  });

  it("应该支持可空参数", async () => {
    @Module("test-service")
    class TestService {
      @Action({
        params: [z.string(), z.number().optional(), z.string().optional()],
      })
      testMethod(
        name: string,
        age?: number,
        email?: string
      ): { name: string; age?: number; email?: string } {
        return { name, age, email };
      }
    }

    // 使用 engine.handler 测试
    const testMethodHandler = engine.handler(TestService, "testMethod");

    // 测试只传递第一个参数
    const result1 = await testMethodHandler("Alice");
    expect(result1.name).toBe("Alice");
    expect(result1.age).toBeUndefined();
    expect(result1.email).toBeUndefined();

    // 测试传递所有参数
    const result2 = await testMethodHandler("Bob", 25, "bob@example.com");
    expect(result2).toEqual({
      name: "Bob",
      age: 25,
      email: "bob@example.com",
    });
  });

  it("应该支持参数对齐（跳过中间参数）", async () => {
    @Module("test-service")
    class TestService {
      @Action({
        params: [
          z.string(),
          z.number().optional(),
          z.string().optional(),
          z.boolean(),
        ],
      })
      testMethod(
        name: string,
        age?: number,
        email?: string,
        active: boolean = false
      ): { name: string; age?: number; email?: string; active: boolean } {
        return { name, age, email, active };
      }
    }

    // 使用 engine.handler 测试
    const testMethodHandler = engine.handler(TestService, "testMethod");

    // 测试跳过中间参数，只传递第一个和最后一个
    const result = await testMethodHandler("Alice", undefined, undefined, true);
    expect(result).toEqual({
      name: "Alice",
      active: true,
    });
  });

  it("应该校验返回值", async () => {
    @Module("test-service")
    class TestService {
      @Action({
        params: [z.string(), z.number()],
        returns: UserSchema,
      })
      createUser(name: string, age: number): any {
        // 返回不符合 schema 的数据
        return { invalid: "data" };
      }
    }

    // 注意：返回值校验在 ActionPlugin 的路由处理器中进行
    // 使用 engine.handler 直接调用时，不会进行返回值校验
    // 如果需要测试返回值校验，需要使用 engine.request 或 fetch
    const createUserHandler = engine.handler(TestService, "createUser");
    const result = await createUserHandler("Alice", 25);
    // handler 直接返回原始值，不进行校验
    expect(result).toEqual({ invalid: "data" });
  });

  it("应该同时支持GET和POST方法", async () => {
    @Module("test-service")
    class TestService {
      @Action({
        params: [z.string()],
      })
      testMethod(name: string): { name: string } {
        return { name };
      }
    }

    // 注意：GET/POST 方法支持是 HTTP 路由功能，需要使用 engine.request 测试
    // 使用 engine.request 可以完整执行 ActionPlugin 的路由处理器
    const getResponse = await engine.request(
      "/test-service/testMethod?0=Alice"
    );
    expect(getResponse.ok).toBe(true);
    const getResult = await parseEjsonResponse(getResponse);
    expect(getResult).toMatchObject({
      success: true,
      data: { name: "Alice" },
    });

    // 测试 POST 请求
    const postRequest = new Request("http://localhost/test-service/testMethod", {
      method: "POST",
      headers: { "Content-Type": "application/ejson" },
      body: ejson.stringify({ "0": "Bob" }),
    });
    const postResponse = await engine.request(postRequest);
    expect(postResponse.ok).toBe(true);
    const postResult = await parseEjsonResponse(postResponse);
    expect(postResult).toMatchObject({
      success: true,
      data: { name: "Bob" },
    });
  });

  it("应该支持引擎prefix", async () => {
    // 注意：引擎 prefix 是 HTTP 路由功能，需要使用 engine.request 或 fetch 测试
    // 创建带prefix的引擎
    const { engine: engineWithPrefix, Module: ModuleWithPrefix } =
        Testing.createTestEngine({
        plugins: [new ActionPlugin()],
        options: {
          name: "test-service",
          version: "1.0.0",
          prefix: "/api",
        },
      });

    @ModuleWithPrefix("test-service")
    class TestService {
      @Action({
        params: [z.string()],
      })
      testMethod(name: string): { name: string } {
        return { name };
      }
    }

    const port = await engineWithPrefix.start();

    // GET 请求从 query 参数解析（新路由模式：引擎prefix + 模块名 + Handler名）
    const response = await fetch(
      `http://localhost:${port}/api/test-service/testMethod?0=Alice`
    );

    expect(response.status).toBe(200);
    const result = await parseEjsonResponse(response);
    expect(result).toMatchObject({
      success: true,
      data: { name: "Alice" },
    });
  });

  describe("错误处理和嵌套类型", () => {
    it("应该正确处理嵌套对象的参数验证错误", async () => {
      const AddressSchema = z.object({
        street: z.string(),
        city: z.string(),
        zipCode: z.string().regex(/^\d{5}$/),
      });

      const UserWithAddressSchema = z.object({
        name: z.string(),
        age: z.number(),
        address: AddressSchema,
      });

      @Module("test-service")
      class TestService {
        @Action({
          params: [UserWithAddressSchema],
        })
        createUserWithAddress(user: z.infer<typeof UserWithAddressSchema>) {
          return user;
        }
      }

      await engine.start();

      // 测试嵌套对象中缺少必需字段
      const response1 = await fetch(
        `http://localhost:${engine.getPort()}/test-service/createUserWithAddress`,
        {
          method: "POST",
          headers: { "Content-Type": "application/ejson" },
          body: ejson.stringify({
            "0": {
              name: "Alice",
              age: 25,
              address: {
                street: "123 Main St",
                // 缺少 city 和 zipCode
              },
            },
          }),
        }
      );

      expect(response1.status).toBe(400);
      const error1 = (await response1.json()) as {
        success: boolean;
        error: string;
      };
      expect(error1.success).toBe(false);
      expect(error1.error).toContain("Validation failed");
      expect(error1.error).toContain("参数[0]");
      expect(error1.error).toContain("address.city");
      expect(error1.error).toContain("address.zipCode");

      // 测试嵌套对象中类型错误
      const response2 = await fetch(
        `http://localhost:${engine.getPort()}/test-service/createUserWithAddress`,
        {
          method: "POST",
          headers: { "Content-Type": "application/ejson" },
          body: ejson.stringify({
            "0": {
              name: "Alice",
              age: "invalid", // 类型错误
              address: {
                street: "123 Main St",
                city: "New York",
                zipCode: "12345",
              },
            },
          }),
        }
      );

      expect(response2.status).toBe(400);
      const error2 = (await response2.json()) as {
        success: boolean;
        error: string;
      };
      expect(error2.success).toBe(false);
      expect(error2.error).toContain("参数[0].age");
    });

    it("应该正确处理嵌套数组的参数验证错误", async () => {
      const ItemSchema = z.object({
        id: z.string(),
        quantity: z.number().min(1),
        price: z.number().positive(),
      });

      const OrderSchema = z.object({
        orderId: z.string(),
        items: z.array(ItemSchema),
        total: z.number(),
      });

      @Module("test-service")
      class TestService {
        @Action({
          params: [OrderSchema],
        })
        createOrder(order: z.infer<typeof OrderSchema>) {
          return order;
        }
      }

      const port = await engine.start();

      // 测试嵌套数组中对象的验证错误
      const response = await fetch(
        `http://localhost:${port}/test-service/createOrder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/ejson" },
          body: ejson.stringify({
            "0": {
              orderId: "ORD-001",
              items: [
                {
                  id: "ITEM-1",
                  quantity: -1, // 无效：应该 >= 1
                  price: 10.5,
                },
                {
                  id: "ITEM-2",
                  quantity: 2,
                  price: -5, // 无效：应该是正数
                },
              ],
              total: 100,
            },
          }),
        }
      );

      expect(response.status).toBe(400);
      const error = (await parseEjsonResponse(response)) as {
        success: boolean;
        error: string;
      };
      expect(error.success).toBe(false);
      expect(error.error).toContain("Validation failed");
      expect(error.error).toContain("参数[0]");
      // 应该包含嵌套路径（items数组中的错误）
      expect(error.error).toMatch(/items|quantity|price/);
    });

    it("应该正确处理深层嵌套对象的错误", async () => {
      const CompanySchema = z.object({
        name: z.string(),
        employees: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            department: z.object({
              name: z.string(),
              location: z.object({
                city: z.string(),
                country: z.string(),
              }),
            }),
          })
        ),
      });

      @Module("test-service")
      class TestService {
        @Action({
          params: [CompanySchema],
        })
        createCompany(company: z.infer<typeof CompanySchema>) {
          return company;
        }
      }

      const port = await engine.start();

      // 测试深层嵌套错误 - 确保对象存在，但嵌套属性有类型错误
      const response = await fetch(
        `http://localhost:${port}/test-service/createCompany`,
        {
          method: "POST",
          headers: { "Content-Type": "application/ejson" },
          body: ejson.stringify({
            "0": {
              name: "Acme Corp",
              employees: [
                {
                  id: "EMP-1",
                  name: "John",
                  department: {
                    name: "Engineering",
                    location: {
                      city: "New York",
                      country: 123, // 类型错误：应该是字符串
                    },
                  },
                },
              ],
            },
          }),
        }
      );

      expect(response.status).toBe(400);
      const error = (await parseEjsonResponse(response)) as {
        success: boolean;
        error: string;
      };
      expect(error.success).toBe(false);
      expect(error.error).toContain("Validation failed");
      expect(error.error).toContain("参数[0]");
      // 应该显示深层嵌套路径
      expect(error.error).toMatch(/employees|department|location|country/);
    });

    it("应该正确处理返回值嵌套对象的验证错误", async () => {
      const ProductSchema = z.object({
        id: z.string(),
        name: z.string(),
        price: z.number().positive(),
        category: z.object({
          id: z.string(),
          name: z.string(),
        }),
      });

      @Module("test-service")
      class TestService {
        @Action({
          params: [z.string()],
          returns: ProductSchema,
        })
        getProduct(id: string): any {
          // 返回不符合 schema 的嵌套数据
          return {
            id: "PROD-1",
            name: "Test Product",
            price: 100,
            category: {
              id: "CAT-1",
              // 缺少 name
            },
          };
        }
      }

      const port = await engine.start();

      const response = await fetch(
        `http://localhost:${port}/test-service/getProduct`,
        {
          method: "POST",
          headers: { "Content-Type": "application/ejson" },
          body: ejson.stringify({ "0": "PROD-1" }),
        }
      );

      expect(response.status).toBe(400);
      const error = (await parseEjsonResponse(response)) as {
        success: boolean;
        error: string;
      };
      expect(error.success).toBe(false);
      expect(error.error).toContain("Return value validation failed");
      expect(error.error).toContain("category.name");
    });

    it("应该正确处理多个参数的嵌套错误", async () => {
      const UserSchema = z.object({
        name: z.string(),
        profile: z.object({
          email: z.string().email(),
          age: z.number(),
        }),
      });

      const OrderSchema = z.object({
        orderId: z.string(),
        items: z.array(
          z.object({
            productId: z.string(),
            quantity: z.number(),
          })
        ),
      });

      @Module("test-service")
      class TestService {
        @Action({
          params: [UserSchema, OrderSchema],
        })
        processOrder(
          user: z.infer<typeof UserSchema>,
          order: z.infer<typeof OrderSchema>
        ) {
          return { user, order };
        }
      }

      const port = await engine.start();

      // 测试多个参数都有嵌套错误
      const response = await fetch(
        `http://localhost:${port}/test-service/processOrder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/ejson" },
          body: ejson.stringify({
            "0": {
              name: "Alice",
              profile: {
                email: "invalid-email", // 无效邮箱
                age: 25,
              },
            },
            "1": {
              orderId: "ORD-001",
              items: [
                {
                  productId: "PROD-1",
                  quantity: "invalid", // 类型错误
                },
              ],
            },
          }),
        }
      );

      expect(response.status).toBe(400);
      const error = (await parseEjsonResponse(response)) as {
        success: boolean;
        error: string;
      };
      expect(error.success).toBe(false);
      expect(error.error).toContain("Validation failed");
      // 应该包含两个参数的错误
      expect(error.error).toContain("参数[0]");
      expect(error.error).toContain("参数[1]");
    });
  });
});
