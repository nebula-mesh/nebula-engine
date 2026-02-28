import type { SamplerOptions, RequestContextData } from "./types";

export class Sampler {
  private rate: number;
  private minDuration: number;

  constructor(options?: SamplerOptions) {
    this.rate = options?.rate ?? 1.0;
    this.minDuration = options?.minDuration ?? 0;
  }

  shouldSample(context: RequestContextData, duration?: number): boolean {
    if (this.rate >= 1.0) {
      return true;
    }

    if (this.rate <= 0) {
      return false;
    }

    if (duration !== undefined && duration >= this.minDuration) {
      return true;
    }

    return Math.random() < this.rate;
  }

  setRate(rate: number): void {
    this.rate = Math.max(0, Math.min(1, rate));
  }

  setMinDuration(minDuration: number): void {
    this.minDuration = minDuration;
  }
}
