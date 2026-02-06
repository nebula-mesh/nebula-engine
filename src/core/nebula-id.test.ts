/**
 * Nebula ID Generator 测试
 */

import { describe, it, expect } from "vitest";
import { nebulaId, NEBULA_ID_ALPHABET } from "./nebula-id";

describe("nebulaId", () => {
  describe("基础功能", () => {
    it("应该生成默认长度（12）的 ID", () => {
      const id = nebulaId();
      expect(id).toBeDefined();
      expect(id.length).toBe(12);
    });

    it("应该生成指定长度的 ID", () => {
      const lengths = [1, 5, 10, 16, 32, 64];
      for (const length of lengths) {
        const id = nebulaId(length);
        expect(id.length).toBe(length);
      }
    });

    it("应该生成不同的 ID", () => {
      const id1 = nebulaId();
      const id2 = nebulaId();
      const id3 = nebulaId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });
  });

  describe("字符集验证", () => {
    it("应该只包含大小写字母和数字", () => {
      const validCharsRegex = /^[A-Za-z0-9]+$/;

      for (let i = 0; i < 100; i++) {
        const id = nebulaId();
        expect(validCharsRegex.test(id)).toBe(true);
      }
    });

    it("不应该包含下划线或横线", () => {
      const invalidCharsRegex = /[_-]/;

      for (let i = 0; i < 100; i++) {
        const id = nebulaId();
        expect(invalidCharsRegex.test(id)).toBe(false);
      }
    });

    it("字符集应该包含所有大小写字母和数字", () => {
      expect(NEBULA_ID_ALPHABET).toBe(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
      );
      expect(NEBULA_ID_ALPHABET.length).toBe(62);
    });
  });

  describe("唯一性验证", () => {
    it("生成大量 ID 时应该保持唯一性", () => {
      const ids = new Set<string>();
      const count = 10000;

      for (let i = 0; i < count; i++) {
        const id = nebulaId();
        ids.add(id);
      }

      // 所有 ID 都应该是唯一的
      expect(ids.size).toBe(count);
    });

    it("不同长度的 ID 应该都是唯一的", () => {
      const lengths = [5, 10, 15, 21, 32];

      for (const length of lengths) {
        const ids = new Set<string>();
        const count = 1000;

        for (let i = 0; i < count; i++) {
          const id = nebulaId(length);
          ids.add(id);
        }

        expect(ids.size).toBe(count);
      }
    });
  });

  describe("边界测试", () => {
    it("应该拒绝长度为 0 的请求", () => {
      expect(() => nebulaId(0)).toThrow("ID length must be greater than 0");
    });

    it("应该拒绝负数长度的请求", () => {
      expect(() => nebulaId(-1)).toThrow("ID length must be greater than 0");
      expect(() => nebulaId(-10)).toThrow("ID length must be greater than 0");
    });

    it("应该支持极小长度（1）", () => {
      const id = nebulaId(1);
      expect(id.length).toBe(1);
      expect(/^[A-Za-z0-9]$/.test(id)).toBe(true);
    });

    it("应该支持极大长度", () => {
      const id = nebulaId(1000);
      expect(id.length).toBe(1000);
      expect(/^[A-Za-z0-9]+$/.test(id)).toBe(true);
    });
  });

  describe("性能测试", () => {
    it("应该能快速生成大量 ID", () => {
      const startTime = Date.now();
      const count = 10000;

      for (let i = 0; i < count; i++) {
        nebulaId();
      }

      const duration = Date.now() - startTime;

      // 10000 个 ID 应该在 1 秒内生成完成
      expect(duration).toBeLessThan(1000);
    });
  });
});
