import { describe, expect, it } from "vitest";
import ejson from "ejson";
import { tryParseCompleteJson } from "../utils.ts";

describe("tryParseCompleteJson", () => {
  describe("基本功能", () => {
    it("应该解析单个完整的 JSON 对象", () => {
      const json = '{"value":1,"done":false}';
      const result = tryParseCompleteJson(json);
      
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ value: 1, done: false });
      expect(result!.remaining).toBe("");
    });

    it("应该解析单个完整的 JSON 数组", () => {
      const json = '[1,2,3]';
      const result = tryParseCompleteJson(json);
      
      expect(result).not.toBeNull();
      expect(result!.data).toEqual([1, 2, 3]);
      expect(result!.remaining).toBe("");
    });

    it("应该处理空对象", () => {
      const json = '{}';
      const result = tryParseCompleteJson(json);
      
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({});
      expect(result!.remaining).toBe("");
    });

    it("应该处理空数组", () => {
      const json = '[]';
      const result = tryParseCompleteJson(json);
      
      expect(result).not.toBeNull();
      expect(result!.data).toEqual([]);
      expect(result!.remaining).toBe("");
    });
  });

  describe("多个 JSON 对象", () => {
    it("应该解析第一个对象并保留剩余部分", () => {
      const json = '{"value":1,"done":false}\n{"value":2,"done":false}';
      const result = tryParseCompleteJson(json);
      
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ value: 1, done: false });
      expect(result!.remaining).toBe('{"value":2,"done":false}');
    });

    it("应该处理多个对象之间有空格的情况", () => {
      const json = '{"a":1}   {"b":2}';
      const result = tryParseCompleteJson(json);
      
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ a: 1 });
      expect(result!.remaining).toBe('{"b":2}');
    });

    it("应该处理三个对象的情况", () => {
      const json = '{"a":1}{"b":2}{"c":3}';
      const result = tryParseCompleteJson(json);
      
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ a: 1 });
      expect(result!.remaining).toBe('{"b":2}{"c":3}');
    });
  });

  describe("不完整的 JSON", () => {
    it("应该返回 null 当 JSON 不完整时", () => {
      const json = '{"value":1,"done":false';
      const result = tryParseCompleteJson(json);
      
      expect(result).toBeNull();
    });

    it("应该返回 null 当只有开始括号时", () => {
      const json = '{"value":';
      const result = tryParseCompleteJson(json);
      
      expect(result).toBeNull();
    });

    it("应该返回 null 当字符串未闭合时", () => {
      const json = '{"value":"test';
      const result = tryParseCompleteJson(json);
      
      expect(result).toBeNull();
    });

    it("应该返回 null 当数组不完整时", () => {
      const json = '[1,2,3';
      const result = tryParseCompleteJson(json);
      
      expect(result).toBeNull();
    });
  });

  describe("字符串中的特殊字符", () => {
    it("应该正确处理字符串中的括号", () => {
      const json = '{"value":"test{value}"}';
      const result = tryParseCompleteJson(json);
      
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ value: "test{value}" });
    });

    it("应该正确处理字符串中的转义引号", () => {
      const json = '{"value":"test\\"value"}';
      const result = tryParseCompleteJson(json);
      
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ value: 'test"value' });
    });

    it("应该正确处理字符串中的转义反斜杠", () => {
      const json = '{"value":"test\\\\value"}';
      const result = tryParseCompleteJson(json);
      
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ value: "test\\value" });
    });

    it("应该正确处理字符串中的换行符", () => {
      const json = '{"value":"test\\nvalue"}';
      const result = tryParseCompleteJson(json);
      
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ value: "test\nvalue" });
    });
  });

  describe("嵌套对象", () => {
    it("应该正确处理嵌套对象", () => {
      const json = '{"outer":{"inner":"value"}}';
      const result = tryParseCompleteJson(json);
      
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ outer: { inner: "value" } });
    });

    it("应该正确处理多层嵌套", () => {
      const json = '{"level1":{"level2":{"level3":"value"}}}';
      const result = tryParseCompleteJson(json);
      
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({
        level1: { level2: { level3: "value" } },
      });
    });

    it("应该正确处理嵌套数组", () => {
      const json = '{"items":[[1,2],[3,4]]}';
      const result = tryParseCompleteJson(json);
      
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ items: [[1, 2], [3, 4]] });
    });
  });

  describe("前导空白字符", () => {
    it("应该跳过前导空格", () => {
      const json = '   {"value":1}';
      const result = tryParseCompleteJson(json);
      
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ value: 1 });
    });

    it("应该跳过前导换行符", () => {
      const json = '\n\n{"value":1}';
      const result = tryParseCompleteJson(json);
      
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ value: 1 });
    });

    it("应该跳过前导制表符", () => {
      const json = '\t\t{"value":1}';
      const result = tryParseCompleteJson(json);
      
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ value: 1 });
    });

    it("应该处理只有空白字符的情况", () => {
      const json = '   \n\t  ';
      const result = tryParseCompleteJson(json);
      
      expect(result).toBeNull();
    });
  });

  describe("边界情况 - 你提到的场景", () => {
    it("应该处理第一个 chunk 不完整，第二个 chunk 补齐并包含下一个对象开头的情况", () => {
      // 模拟场景：第一个 chunk: '{"value":1,"test":"sss'
      // 第二个 chunk: 'sss"}\n{"value":2,"done":false}'
      // 合并后: '{"value":1,"test":"ssssss"}\n{"value":2,"done":false}'
      const buffer = '{"value":1,"test":"ssssss"}\n{"value":2,"done":false}';
      
      const result = tryParseCompleteJson(buffer);
      
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ value: 1, test: "ssssss" });
      expect(result!.remaining).toBe('{"value":2,"done":false}');
      
      // 继续解析剩余部分
      const result2 = tryParseCompleteJson(result!.remaining);
      expect(result2).not.toBeNull();
      expect(result2!.data).toEqual({ value: 2, done: false });
    });

    it("应该处理一个 chunk 包含多个不完整 JSON 的情况", () => {
      const buffer = '{"value":1,"done":false}\n{"value":2,"test":"incomplete';
      
      const result = tryParseCompleteJson(buffer);
      
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ value: 1, done: false });
      expect(result!.remaining).toBe('{"value":2,"test":"incomplete');
      
      // 剩余部分不完整，应该返回 null
      const result2 = tryParseCompleteJson(result!.remaining);
      expect(result2).toBeNull();
    });

    it("应该处理字符串中包含 JSON 样式的文本", () => {
      const json = '{"value":"{\\"nested\\":\\"json\\"}"}';
      const result = tryParseCompleteJson(json);
      
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ value: '{"nested":"json"}' });
    });
  });

  describe("EJSON 特殊类型", () => {
    it("应该正确处理 EJSON 日期类型", () => {
      const date = new Date();
      const json = ejson.stringify({ date, value: 1 });
      const result = tryParseCompleteJson(json);
      
      expect(result).not.toBeNull();
      expect(result!.data.value).toBe(1);
      expect(result!.data.date).toBeInstanceOf(Date);
    });

    it("应该正确处理 EJSON 特殊值", () => {
      const json = ejson.stringify({
        undefined: undefined,
        null: null,
        value: 1,
      });
      const result = tryParseCompleteJson(json);
      
      expect(result).not.toBeNull();
      expect(result!.data.value).toBe(1);
      expect(result!.data.null).toBeNull();
    });
  });

  describe("错误情况", () => {
    it("应该返回 null 当输入不是 JSON 时", () => {
      const json = "not a json";
      const result = tryParseCompleteJson(json);
      
      expect(result).toBeNull();
    });

    it("应该返回 null 当输入为空字符串时", () => {
      const json = "";
      const result = tryParseCompleteJson(json);
      
      expect(result).toBeNull();
    });

    it("应该返回 null 当输入是无效的 JSON 时", () => {
      const json = '{"invalid":}';
      const result = tryParseCompleteJson(json);
      
      expect(result).toBeNull();
    });
  });

  describe("实际流式场景模拟", () => {
    it("应该模拟真实的流式响应场景", () => {
      // 模拟多个 chunk 逐步累积的场景
      const chunks = [
        '{"value":1,"done":false,"test":"sss',
        'sss"}\n{"value":2,"done":false,"next":"incom',
        'plete',
        'complete"}\n{"value":3,"done":true}',
      ];

      let buffer = "";
      const results: any[] = [];

      for (const chunk of chunks) {
        buffer += chunk;
        
        let result = tryParseCompleteJson(buffer);
        while (result) {
          results.push(result.data);
          buffer = result.remaining;
          result = tryParseCompleteJson(buffer);
        }
      }

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ value: 1, done: false, test: "ssssss" });
      expect(results[1]).toEqual({
        value: 2,
        done: false,
        next: "incompletecomplete",
      });
      expect(results[2]).toEqual({ value: 3, done: true });
      expect(buffer).toBe("");
    });

    it("应该处理流结束时缓冲区还有不完整数据的情况", () => {
      const buffer = '{"value":1,"done":false}\n{"value":2,"test":"incomplete';
      
      const result = tryParseCompleteJson(buffer);
      
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ value: 1, done: false });
      
      // 剩余部分不完整
      const remaining = result!.remaining;
      const result2 = tryParseCompleteJson(remaining);
      expect(result2).toBeNull();
    });
  });
});

