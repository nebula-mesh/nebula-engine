import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StreamError } from "../errors.ts";
import { MicroserviceClient } from "./generated.ts";
import { createTestService } from "./setup.ts";
import { assertStream, collectStream } from "./utils.ts";

describe("Stream", () => {
  const service = createTestService();
  const port = 3337;
  const baseUrl = `http://localhost:${port}`;

  beforeAll(async () => {
    await service.start(port);
  });

  afterAll(async () => {
    await service.stop();
  });

  describe("HTTP Stream", () => {
    const client = new MicroserviceClient({
      baseUrl,
      prefix: "/api",
    });

    it("should handle stream data", async () => {
      const stream = await client.test.streamNumbers(3);
      await assertStream(stream, [0, 1, 2]);
    });

    it("should handle stream error", async () => {
      const stream = await client.test.streamNumbers(-1);
      expect(() => stream[Symbol.asyncIterator]().next()).rejects.toThrow(
        StreamError
      );
    });

    it("should handle stream cancellation", async () => {
      const stream = await client.test.streamNumbers(10);
      const iterator = stream[Symbol.asyncIterator]();

      // 读取前3个值
      for (let i = 0; i < 3; i++) {
        const { value } = await iterator.next();
        expect(value).toBe(i);
      }

      // 取消流
      await iterator.return?.();
    });

    it("should handle concurrent streams", async () => {
      const streams = await Promise.all([
        client.test.streamNumbers(2),
        client.test.streamNumbers(3),
      ]);

      const results = await Promise.all(
        streams.map((stream) => collectStream(stream))
      );

      expect(results).toEqual([
        [0, 1],
        [0, 1, 2],
      ]);
    });
  });
});

