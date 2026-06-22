import { expect } from "vitest";

export async function collectStream<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const item of stream) {
    results.push(item);
  }
  return results;
}

export async function assertStream<T>(
  stream: AsyncIterable<T>,
  expected: T[]
): Promise<T[]> {
  const results = await collectStream(stream);
  expect(results).toEqual(expected);
  return results;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
