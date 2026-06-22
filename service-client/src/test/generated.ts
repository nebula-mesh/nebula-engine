import { BaseMicroserviceClient as BaseMicroserviceClient } from "../client.ts";

export interface TestModule {
  echo: (msg: string) => Promise<string>;
  streamNumbers: (count: number) => Promise<AsyncIterable<number>>;
  streamError: (count: number) => Promise<AsyncIterable<number>>;
  idempotentEcho: (msg: string) => Promise<string>;
  error: (msg: string) => Promise<string>;
}

export class MicroserviceClient extends BaseMicroserviceClient {
  public readonly test = this.registerModule<TestModule>("test", {
    echo: { idempotent: false, stream: false },
    streamNumbers: { idempotent: false, stream: true },
    streamError: { idempotent: false, stream: true },
    idempotentEcho: { idempotent: true, stream: false },
    error: { idempotent: false, stream: false },
  });
}
