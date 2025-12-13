import { expect, test } from "vitest";
import { z } from "zod";
import { getZodTypeString } from "./generator";

test("zod type string", () => {
  const testCases = [
    {
      type: getZodTypeString(
        z.object({
          a: z.string(),
          b: z.record(z.string(), z.string()),
          c: z.map(z.number(), z.any()),
          d: z.unknown(),
          e: z.enum(["a", "b", "c"]),
          f: z.string().default("test"),
        }),
        true
      ),
      expected:
        '{ a: string; b: Record<string, string>; c: Map<number, any>; d: unknown; e: ("a" | "b" | "c"); f?: string }',
    },
    {
      type: getZodTypeString(
        z.object({
          a: z.string(),
          b: z.instanceof(Uint8Array),
          c: z.date(),
          d: z.instanceof(RegExp),
        })
      ),
      expected: "{ a: string; b: Uint8Array; c: Date; d: unknown }",
    },
    {
      type: getZodTypeString(z.string().default("test")),
      expected: "string",
    },
    {
      type: getZodTypeString(
        z.number().transform((val) => parseFloat(val.toString()))
      ),
      expected: "number",
    },
    {
      type: getZodTypeString(z.bigint().transform((val) => BigInt(val))),
      expected: "bigint",
    },
  ];

  for (const element of testCases) {
    expect(element.type).toEqual(element.expected);
  }
});
