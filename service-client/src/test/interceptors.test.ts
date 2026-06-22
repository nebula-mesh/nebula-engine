import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClientError } from "../errors.ts";
import { MicroserviceClient } from "./generated.ts";
import { createTestService } from "./setup.ts";

describe("Interceptors", () => {
  const service = createTestService();
  const port = 3334;
  const baseUrl = `http://localhost:${port}`;

  beforeAll(async () => {
    await service.start(port);
  });

  afterAll(async () => {
    await service.stop();
  });

  it("should handle request interceptor", async () => {
    const requests: any[] = [];
    const client = new MicroserviceClient({
      baseUrl,
      interceptors: [
        {
          onRequest: (config) => {
            requests.push(config);
            config.headers["X-Test"] = "test";
          },
        },
      ],
    });

    await client.test.echo("hello");
    expect(requests.length).toBe(1);
    expect(requests[0].headers["X-Test"]).toBe("test");
  });

  it("should handle response interceptor", async () => {
    const responses: Response[] = [];
    const client = new MicroserviceClient({
      baseUrl,
      interceptors: [
        {
          onResponse: (response) => {
            responses.push(response);
            return response;
          },
        },
      ],
    });

    await client.test.echo("hello");
    expect(responses.length).toBe(1);
    expect(responses[0].ok).toBe(true);
  });

  it("should handle error interceptor", async () => {
    let interceptedError: Error | undefined;
    const client = new MicroserviceClient({
      baseUrl,
      interceptors: [
        {
          onError: (error) => {
            interceptedError = error;
            return error;
          },
        },
      ],
    });

    await expect(() => client.test.error("test")).rejects.toThrow(ClientError);
    expect(interceptedError?.message).toBe("Test error");
  });
});
