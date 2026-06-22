export class ClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientError";
  }
}

export class ConnectionError extends ClientError {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionError";
  }
}

export class TimeoutError extends ClientError {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

export class StreamError extends ClientError {
  constructor(message: string) {
    super(message);
    this.name = "StreamError";
  }
}
