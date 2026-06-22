import { describe, expect, it } from "vitest";
import { ClientError, ConnectionError, TimeoutError } from "../errors.ts";
import { MicroserviceClient } from "./generated.ts";
import { createTestService } from "./setup.ts";

describe("Retry", () => {
  const baseUrl = `http://not-exist`;

  it("should retry on connection error", async () => {
    const attempts: number[] = [];
    const client = new MicroserviceClient({
      baseUrl,
      retry: {
        maxAttempts: 3,
        delays: [10, 20],
        shouldRetry: (error) => {
          attempts.push(attempts.length + 1);
          return error instanceof ConnectionError;
        },
      },
    });

    await expect(() => client.test.idempotentEcho("retry")).rejects.toThrow(
      ConnectionError
    );

    expect(attempts).toEqual([1, 2, 3]);
  });

  it("should not retry on client error", async () => {
    const service = createTestService();
    const port = 3336;
    const baseUrl = `http://localhost:${port}`;

    await service.start(port);

    try {
      const attempts: number[] = [];
      const client = new MicroserviceClient({
        baseUrl,
        retry: {
          maxAttempts: 3,
          delays: [10, 20],
          shouldRetry: () => {
            attempts.push(attempts.length + 1);
            return true;
          },
        },
      });

      await expect(() => client.test.error("no-retry")).rejects.toThrow(
        ClientError
      );

      expect(attempts).toEqual([]);
    } finally {
      await service.stop();
    }
  });

  it("should not retry stream requests", async () => {
    const attempts: number[] = [];
    const client = new MicroserviceClient({
      baseUrl,
      retry: {
        maxAttempts: 3,
        delays: [10, 20],
        shouldRetry: () => {
          attempts.push(attempts.length + 1);
          return true;
        },
      },
    });

    await expect(() => client.test.streamNumbers(3)).rejects.toThrow(
      ConnectionError
    );

    expect(attempts).toEqual([]);
  });

  it("should handle custom retry delays", async () => {
    const timestamps: number[] = [];
    const client = new MicroserviceClient({
      baseUrl,
      request: { timeout: 1000 },
      retry: {
        maxAttempts: 3,
        delays: [100, 200],
        shouldRetry: () => {
          timestamps.push(Date.now());
          return true;
        },
      },
    });

    await expect(() => client.test.idempotentEcho("delays")).rejects.toThrow(
      TimeoutError
    );

    const intervals = timestamps
      .slice(1)
      .map((t, i) => t - timestamps[i] - 1000);

    // 允许误差
    expect(intervals.map((i) => Math.round(i / 100) * 100)).toEqual([100, 200]);
  });
});
