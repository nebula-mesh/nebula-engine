import {
  coerceStringToNumber,
  coerceNumberToString,
  coerceStringToBoolean,
  coerceNumberToBoolean,
  isOptional,
  isNullable,
  isStringType,
  isNumberType,
  isBooleanType,
  coerceBody,
  type CoerceOptions,
} from "./type-coercion";
import {
  coerceStringToNumber,
  coerceNumberToString,
  coerceStringToBoolean,
  coerceNumberToBoolean,
  isOptional,
  isNullable,
  isStringType,
  isNumberType,
  isBooleanType,
  coerceBody,
  type CoerceOptions,
} from "./type-coercion";
import {
  coerceStringToNumber,
  coerceNumberToString,
  coerceStringToBoolean,
  coerceNumberToBoolean,
  isOptional,
  isNullable,
  isStringType,
  isNumberType,
  isBooleanType,
  coerceBody,
  type CoerceOptions,
} from "./type-coercion";
import {
  coerceStringToNumber,
  coerceNumberToString,
  coerceStringToBoolean,
  coerceNumberToBoolean,
  isOptional,
  isNullable,
  isStringType,
  isNumberType,
  isBooleanType,
  coerceBody,
  type CoerceOptions,
} from "./type-coercion";
import {
  coerceStringToNumber,
  coerceNumberToString,
  coerceStringToBoolean,
  coerceNumberToBoolean,
  isOptional,
  isNullable,
  isStringType,
  isNumberType,
  isBooleanType,
  coerceBody,
  type CoerceOptions,
} from "./type-coercion";
import {
  coerceStringToNumber,
  coerceNumberToString,
  coerceStringToBoolean,
  coerceNumberToBoolean,
  isOptional,
  isNullable,
  isStringType,
  isNumberType,
  isBooleanType,
  coerceBody,
  type CoerceOptions,
} from "./type-coercion";
import {
  coerceStringToNumber,
  coerceNumberToString,
  coerceStringToBoolean,
  coerceNumberToBoolean,
  isOptional,
  isNullable,
  isStringType,
  isNumberType,
  isBooleanType,
  coerceBody,
  type CoerceOptions,
} from "./type-coercion";
import {
  coerceStringToNumber,
  coerceNumberToString,
  coerceStringToBoolean,
  coerceNumberToBoolean,
  isOptional,
  isNullable,
  isStringType,
  isNumberType,
  isBooleanType,
  coerceBody,
  type CoerceOptions,
} from "./type-coercion";
import { describe, expect, it } from "vitest";
import { z } from "zod";

describe("type-coercion", () => {
  describe("coerceStringToNumber", () => {
    it("should return number as-is", () => {
      const result = coerceStringToNumber(123);
      expect(result.success).toBe(true);
      expect(result.value).toBe(123);
    });

    it("should convert valid string to number", () => {
      const result = coerceStringToNumber("123");
      expect(result.success).toBe(true);
      expect(result.value).toBe(123);
    });

    it("should convert string with whitespace to number", () => {
      const result = coerceStringToNumber("  456  ");
      expect(result.success).toBe(true);
      expect(result.value).toBe(456);
    });

    it("should fail on empty string", () => {
      const result = coerceStringToNumber("");
      expect(result.success).toBe(false);
    });

    it("should fail on invalid string", () => {
      const result = coerceStringToNumber("abc");
      expect(result.success).toBe(false);
    });

    it("should convert negative numbers", () => {
      const result = coerceStringToNumber("-123.45");
      expect(result.success).toBe(true);
      expect(result.value).toBe(-123.45);
    });
  });

  describe("coerceNumberToString", () => {
    it("should return string as-is", () => {
      const result = coerceNumberToString("hello");
      expect(result.success).toBe(true);
      expect(result.value).toBe("hello");
    });

    it("should convert number to string", () => {
      const result = coerceNumberToString(123);
      expect(result.success).toBe(true);
      expect(result.value).toBe("123");
    });

    it("should convert boolean to string", () => {
      const result = coerceNumberToString(true);
      expect(result.success).toBe(true);
      expect(result.value).toBe("true");
    });
  });

  describe("coerceStringToBoolean", () => {
    it("should return boolean as-is", () => {
      const result = coerceStringToBoolean(true);
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it("should convert 'true' string to true", () => {
      const result = coerceStringToBoolean("true");
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it("should convert '1' string to true", () => {
      const result = coerceStringToBoolean("1");
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it("should convert 'yes' string to true", () => {
      const result = coerceStringToBoolean("yes");
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it("should convert 'false' string to false", () => {
      const result = coerceStringToBoolean("false");
      expect(result.success).toBe(true);
      expect(result.value).toBe(false);
    });

    it("should convert '0' string to false", () => {
      const result = coerceStringToBoolean("0");
      expect(result.success).toBe(true);
      expect(result.value).toBe(false);
    });

    it("should fail on invalid string", () => {
      const result = coerceStringToBoolean("maybe");
      expect(result.success).toBe(false);
    });
  });

  describe("isOptional", () => {
    it("should detect ZodOptional", () => {
      const schema = z.string().optional();
      expect(isOptional(schema)).toBe(true);
    });

    it("should not detect ZodString as optional", () => {
      const schema = z.string();
      expect(isOptional(schema)).toBe(false);
    });
  });

  describe("isNullable", () => {
    it("should detect ZodNullable", () => {
      const schema = z.string().nullable();
      expect(isNullable(schema)).toBe(true);
    });

    it("should not detect ZodString as nullable", () => {
      const schema = z.string();
      expect(isNullable(schema)).toBe(false);
    });
  });

  describe("coerceBody", () => {
    it("should return original body when no schemas provided", () => {
      const body = { "0": "123" };
      const result = coerceBody(body, []);
      expect(result).toEqual(body);
    });

    it("should coerce string to number when schema expects number", () => {
      const body = { "0": "123" };
      const schemas = [z.number()];
      const result = coerceBody(body, schemas);
      expect(result["0"]).toBe(123);
    });

    it("should coerce string to boolean when schema expects boolean", () => {
      const body = { "0": "true" };
      const schemas = [z.boolean()];
      const result = coerceBody(body, schemas);
      expect(result["0"]).toBe(true);
    });

    it("should not coerce when types already match", () => {
      const body = { "0": "hello", "1": 123 };
      const schemas = [z.string(), z.number()];
      const result = coerceBody(body, schemas);
      expect(result["0"]).toBe("hello");
      expect(result["1"]).toBe(123);
    });

    it("should convert empty string to null for nullable schema", () => {
      const body = { "0": "" };
      const schemas = [z.string().nullable()];
      const result = coerceBody(body, schemas);
      expect(result["0"]).toBe(null);
    });

    it("should convert empty string to undefined for optional schema", () => {
      const body = { "0": "" };
      const schemas = [z.string().optional()];
      const result = coerceBody(body, schemas);
      expect(result["0"]).toBe(undefined);
    });

    it("should preserve unknown keys", () => {
      const body = { "0": "123", name: "test" };
      const schemas = [z.number()];
      const result = coerceBody(body, schemas);
      expect(result["0"]).toBe(123);
      expect(result["name"]).toBe("test");
    });

    it("should handle mixed coercion scenarios", () => {
      const body = {
        "0": "123",
        "1": "true",
        "2": 456,
        "3": "",
      };
      const schemas = [
        z.number(),
        z.boolean(),
        z.string(),
        z.string().optional(),
      ];
      const result = coerceBody(body, schemas);
      expect(result["0"]).toBe(123); // string "123" coerced to number 123
      expect(result["1"]).toBe(true); // string "true" coerced to boolean true
      expect(result["2"]).toBe(456); // number 456 NOT coerced to string (coerceNumberToString is false by default)
      expect(result["3"]).toBe(undefined); // empty string coerced to undefined for optional
    });
  });
});
