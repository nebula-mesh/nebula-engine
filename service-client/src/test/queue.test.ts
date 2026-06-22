import { describe, expect, it } from "vitest";
import { TimeoutError } from "../errors.ts";
import { RequestQueue } from "../queue.ts";
import { delay } from "./utils.ts";

describe("RequestQueue", () => {
  it("should handle concurrent requests", async () => {
    const queue = new RequestQueue(2);
    const results: number[] = [];
    const running = new Set<number>();
    const maxConcurrent = { value: 0 };

    await Promise.all([
      queue.add("1", async () => {
        running.add(1);
        maxConcurrent.value = Math.max(maxConcurrent.value, running.size);
        await delay(150);
        running.delete(1);
        results.push(1);
        return 1;
      }),
      queue.add("2", async () => {
        running.add(2);
        maxConcurrent.value = Math.max(maxConcurrent.value, running.size);
        await delay(100);
        running.delete(2);
        results.push(2);
        return 2;
      }),
      queue.add("3", async () => {
        running.add(3);
        maxConcurrent.value = Math.max(maxConcurrent.value, running.size);
        await delay(100);
        running.delete(3);
        results.push(3);
        return 3;
      }),
    ]);

    // 验证最大并发数不超过2
    expect(maxConcurrent.value).toBe(2);

    // 验证第三个任务一定是最后一个完成的
    const thirdIndex = results.indexOf(3);
    expect(thirdIndex === results.length - 1).toBe(true);

    expect(results).toEqual([2, 1, 3]);
  });

  it("should handle request timeout", async () => {
    const queue = new RequestQueue(1);

    expect(() =>
      queue.add(
        "timeout",
        async () => {
          await delay(200);
          return true;
        },
        100
      )
    ).rejects.toThrow(TimeoutError);
  });

  it("should handle request abort", async () => {
    const queue = new RequestQueue(1);
    const promise = queue.add("abort", async () => {
      await delay(1000);
      return true;
    });
    queue.abort("abort");
    expect(() => promise).rejects.toThrow(TimeoutError);
  });

  it("should handle queue clear", async () => {
    const queue = new RequestQueue(1);
    const promises = [
      queue.add("1", () => delay(100)),
      queue.add("2", () => delay(100)),
      queue.add("3", () => delay(100)),
    ];

    queue.clear();
    await Promise.all(
      promises.map((p) => expect(() => p).rejects.toThrow(TimeoutError))
    );
  });
});
