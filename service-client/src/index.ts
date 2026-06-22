export { BaseMicroserviceClient } from "./client.ts";
export * from "./errors.ts";
export type {
  ClientConfig,
  ClientOptions,
  RequestOptions,
  RetryOptions,
  StreamOptions,
} from "./types.ts";

import { BaseMicroserviceClient } from "./client.ts";
// @deprecated
export const MicroserviceClient = BaseMicroserviceClient;
