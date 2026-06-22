# nebula-client

Type-safe HTTP client for Nebula Engine.

## Features

- 📡 Streaming support
- 🔁 Retry mechanism
- ⚡ Request interceptors
- 🚦 Request queue management
- 💪 Type-safe API
- 🌐 Cross-platform (Node.js, Deno, Browser)

## Installation

```bash
npm install nebula-client
```

## Usage

### Basic Usage

```typescript
import { MicroserviceClient } from "nebula-client";

const client = new MicroserviceClient({
  baseUrl: "http://localhost:3000",
  prefix: "/api",
});

// Normal request
const result = await client.someModule.someMethod("arg1", "arg2");

// Stream request
for await (const item of await client.someModule.streamMethod(10)) {
  console.log(item);
}
```

### Interceptors

```typescript
const client = new MicroserviceClient({
  baseUrl: "http://localhost:3000",
  prefix: "/api",
  interceptors: [
    {
      onRequest: async (config) => {
        config.headers["Authorization"] = "Bearer token";
      },
      onResponse: async (response) => {
        // Transform response
        return response;
      },
      onError: async (error) => {
        // Handle error
        return error;
      },
    },
  ],
});
```

### Retry Configuration

```typescript
const client = new MicroserviceClient({
  baseUrl: "http://localhost:3000",
  prefix: "/api",
  retry: {
    maxAttempts: 3,
    delays: [1000, 2000, 5000],
    shouldRetry: (error) => error instanceof ConnectionError,
  },
});
```

### Request Queue

```typescript
const client = new MicroserviceClient({
  baseUrl: "http://localhost:3000",
  prefix: "/api",
  request: {
    concurrency: 5, // Maximum concurrent requests
    timeout: 5000,
  },
});
```

## API Reference

### MicroserviceClient

#### Constructor Options

```typescript
interface ClientConfig {
  baseUrl: string;
  prefix?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
  retry?: RetryOptions;
  request?: RequestOptions;
  stream?: StreamOptions;
  interceptors?: RequestInterceptor[];
}
```

For more details, please check the source code and tests.

## License

MIT
