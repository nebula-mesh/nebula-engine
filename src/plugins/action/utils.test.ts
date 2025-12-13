import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  buildActionPath,
  buildParamsSchema,
  parseAndValidateParams,
} from "./utils";

describe("ActionPlugin Utils", () => {
  describe("buildParamsSchema", () => {
    it("应该能够构建参数验证 Schema", () => {
      const schemas = [z.string(), z.number()];
      const paramsSchema = buildParamsSchema(schemas);

      // 验证 Schema 结构
      const result = paramsSchema.safeParse({ "0": "Alice", "1": 25 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data["0"]).toBe("Alice");
        expect(result.data["1"]).toBe(25);
      }
    });

    it("应该支持空数组", () => {
      const schemas: z.ZodTypeAny[] = [];
      const paramsSchema = buildParamsSchema(schemas);

      const result = paramsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("应该支持可选参数", () => {
      const schemas = [z.string(), z.number().optional(), z.string()];
      const paramsSchema = buildParamsSchema(schemas);

      // 缺少可选参数应该通过验证
      const result = paramsSchema.safeParse({ "0": "Alice", "2": "Bob" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data["0"]).toBe("Alice");
        expect(result.data["1"]).toBeUndefined();
        expect(result.data["2"]).toBe("Bob");
      }
    });

    it("应该支持复杂类型", () => {
      const UserSchema = z.object({
        id: z.string(),
        name: z.string(),
      });
      const schemas = [z.string(), UserSchema];
      const paramsSchema = buildParamsSchema(schemas);

      const result = paramsSchema.safeParse({
        "0": "test",
        "1": { id: "1", name: "Alice" },
      });
      expect(result.success).toBe(true);
    });
  });

  describe("parseAndValidateParams", () => {
    it("应该能够解析并验证参数", () => {
      const body = { "0": "Alice", "1": 25 };
      const schemas = [z.string(), z.number()];
      const result = parseAndValidateParams(body, schemas);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(["Alice", 25]);
      }
    });

    it("应该返回空数组当没有定义参数时", () => {
      const body = { "0": "Alice" };
      const schemas: z.ZodTypeAny[] = [];
      const result = parseAndValidateParams(body, schemas);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([]);
      }
    });

    it("应该处理空 body", () => {
      const body = null;
      const schemas = [z.string().optional()];
      const result = parseAndValidateParams(body, schemas);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0]).toBeUndefined();
      }
    });

    it("应该验证参数类型", () => {
      const body = { "0": "Alice", "1": "invalid" };
      const schemas = [z.string(), z.number()];
      const result = parseAndValidateParams(body, schemas);

      expect(result.success).toBe(false);
      if (!result.success) {
        // Zod 4.x: 使用 issues 替代 errors
        const errors = result.error.issues || [];
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].path).toContain("1");
      }
    });

    it("应该支持可选参数", () => {
      const body = { "0": "Alice" };
      const schemas = [
        z.string(),
        z.number().optional(),
        z.string().optional(),
      ];
      const result = parseAndValidateParams(body, schemas);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0]).toBe("Alice");
        expect(result.data[1]).toBeUndefined();
        expect(result.data[2]).toBeUndefined();
      }
    });

    it("应该支持参数对齐（跳过中间参数）", () => {
      const body = { "0": "Alice", "3": true };
      const schemas = [
        z.string(),
        z.number().optional(),
        z.string().optional(),
        z.boolean(),
      ];
      const result = parseAndValidateParams(body, schemas);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0]).toBe("Alice");
        expect(result.data[1]).toBeUndefined();
        expect(result.data[2]).toBeUndefined();
        expect(result.data[3]).toBe(true);
      }
    });

    it("应该正确处理缺失的必需参数", () => {
      const body = { "0": "Alice" };
      const schemas = [z.string(), z.number()];
      const result = parseAndValidateParams(body, schemas);

      expect(result.success).toBe(false);
      if (!result.success) {
        // Zod 4.x: 使用 issues 替代 errors
        const errors = result.error.issues || [];
        expect(errors.length).toBeGreaterThan(0);
        // 应该报告缺少 "1" 参数
        const hasMissingError = errors.some((err) => err.path?.includes("1"));
        expect(hasMissingError).toBe(true);
      }
    });
  });

  describe("buildActionPath", () => {
    it("应该能够构建带 prefix 的路由路径", () => {
      const path = buildActionPath("/api", "user-service", "createUser");
      expect(path).toBe("/api/user-service/createUser");
    });

    it("应该能够构建不带 prefix 的路由路径", () => {
      const path = buildActionPath("", "user-service", "createUser");
      expect(path).toBe("/user-service/createUser");
    });

    it("应该处理 prefix 末尾的斜杠", () => {
      const path = buildActionPath("/api/", "user-service", "createUser");
      expect(path).toBe("/api/user-service/createUser");
    });

    it("应该处理多个连续的斜杠", () => {
      const path = buildActionPath("//api//", "user-service", "createUser");
      expect(path).toBe("/api/user-service/createUser");
    });

    it("应该处理 prefix 为空字符串的情况", () => {
      const path = buildActionPath("", "test-service", "testMethod");
      expect(path).toBe("/test-service/testMethod");
    });

    it("应该处理只有斜杠的 prefix", () => {
      const path = buildActionPath("/", "test-service", "testMethod");
      expect(path).toBe("/test-service/testMethod");
    });
  });
});
