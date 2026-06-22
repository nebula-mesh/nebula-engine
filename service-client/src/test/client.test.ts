import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MicroserviceClient } from "./generated.ts";
import { createTestService } from "./setup.ts";

describe("MicroserviceClient", () => {
  let service = createTestService();
  const port = 3333;
  const baseUrl = `http://localhost:${port}`;

  beforeAll(async () => {
    await service.start(port);
  });

  afterAll(async () => {
    await service.stop();
  });

  describe("HTTP Client", () => {
    const client = new MicroserviceClient({
      baseUrl,
      prefix: "/api",
    });

    it("should handle normal request", async () => {
      const result = await client.test.echo("hello");
      expect(result).toBe("hello");
    });
  });
});
