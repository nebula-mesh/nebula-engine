import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ClientError,
  ConnectionError,
  StreamError,
  TimeoutError,
} from "../errors.ts";
import { MicroserviceClient } from "./generated.ts";
import { createTestService } from "./setup.ts";

describe("Error Handling", () => {
  const service = createTestService();
  const port = 3336;
  const baseUrl = `http://localhost:${port}`;

  beforeAll(async () => {
    await service.start(port);
  });

  afterAll(async () => {
    await service.stop();
  });

  it("should handle client errors", async () => {
    const client = new MicroserviceClient({ baseUrl });
    await expect(() => client.test.error("test")).rejects.toThrow(ClientError);
  });

  it("should handle connection errors", async () => {
    const client = new MicroserviceClient({ baseUrl: "http://not-exist" });

    await expect(() => client.test.echo("test")).rejects.toThrow(
      ConnectionError
    );
  });

  it("should handle timeout errors", async () => {
    const client = new MicroserviceClient({
      baseUrl,
      request: {
        timeout: 50,
      },
    });

    await expect(() => client.test.echo("timeout-delay")).rejects.toThrow(
      TimeoutError
    );
  });

  it("should handle stream errors", async () => {
    const client = new MicroserviceClient({ baseUrl });

    const stream = await client.test.streamError(3);
    const iterator = stream[Symbol.asyncIterator]();

    expect((await iterator.next()).value).toBe(0);
    expect((await iterator.next()).value).toBe(1);

    await expect(() => iterator.next()).rejects.toThrow(StreamError);
  });
});
