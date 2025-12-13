import { Etcd3, Election, Observer, Campaign } from "./types";

/**
 * Mock Etcd3 客户端
 * 用于测试和本地开发，模拟 etcd 的选举机制
 * 始终选举第一个参与选举的候选者作为 leader
 */
export class MockEtcd3 implements Etcd3 {
  private elections: Map<string, MockElection> = new Map();

  election(key: string, ttl: number): Election {
    if (!this.elections.has(key)) {
      this.elections.set(key, new MockElection(key));
    }
    return this.elections.get(key)!;
  }

  close(): void {
    // Mock implementation: do nothing
  }

  delete(): any {
    // Mock implementation: return a chainable object
    return {
      prefix: () => Promise.resolve(),
    };
  }

  get(key: string): any {
    // Mock implementation: return a chainable object
    return {
      string: () => Promise.resolve(null),
    };
  }

  getElection(key: string): MockElection | undefined {
    return this.elections.get(key);
  }

  clearElections(): void {
    this.elections.clear();
  }
}

/**
 * Mock Election
 */
class MockElection implements Election {
  private observers: MockObserver[] = [];
  private campaigns: MockCampaign[] = [];
  private currentLeader: string | null = null;

  constructor(private key: string) {}

  async observe(): Promise<Observer> {
    const observer = new MockObserver(this);
    this.observers.push(observer);
    // 如果已经有 leader，立即通知
    if (this.currentLeader) {
      setTimeout(() => {
        observer.notifyChange(this.currentLeader!);
      }, 0);
    }
    return observer;
  }

  campaign(candidate: string): Campaign {
    const campaign = new MockCampaign(candidate, this);
    this.campaigns.push(campaign);

    // 如果没有当前 leader，异步选举（模拟真实 etcd 行为）
    // 使用 setTimeout 确保回调有时间注册
    if (!this.currentLeader) {
      setTimeout(() => {
        this.setLeader(candidate);
      }, 50);
    }

    return campaign;
  }

  setLeader(leader: string): void {
    this.currentLeader = leader;
    // 通知所有 observers
    for (const observer of this.observers) {
      observer.notifyChange(leader);
    }
    // 通知被选中的 campaign（异步执行，确保回调已注册）
    setTimeout(() => {
      for (const campaign of this.campaigns) {
        if (campaign.candidate === leader && !campaign.resigned) {
          campaign.notifyElected();
        }
      }
    }, 50);
  }

  getCurrentLeader(): string | null {
    return this.currentLeader;
  }
}

/**
 * Mock Observer
 */
class MockObserver implements Observer {
  private changeCallbacks: ((leader: string | undefined) => void)[] = [];
  private disconnectedCallbacks: ((error: Error) => void)[] = [];
  private errorCallbacks: ((error: Error) => void)[] = [];

  constructor(private election: MockElection) {}

  on(event: "change", callback: (leader: string | undefined) => void): Observer;
  on(event: "disconnected", callback: (error: Error) => void): Observer;
  on(event: "error", callback: (error: Error) => void): Observer;
  on(event: string, callback: any): Observer {
    if (event === "change") {
      this.changeCallbacks.push(callback);
    } else if (event === "disconnected") {
      this.disconnectedCallbacks.push(callback);
    } else if (event === "error") {
      this.errorCallbacks.push(callback);
    }
    return this;
  }

  notifyChange(leader: string): void {
    for (const callback of this.changeCallbacks) {
      callback(leader);
    }
  }
}

/**
 * Mock Campaign
 */
class MockCampaign implements Campaign {
  private errorCallbacks: ((error: any) => void)[] = [];
  private electedCallbacks: (() => void)[] = [];
  public resigned: boolean = false;

  constructor(
    public readonly candidate: string,
    private election: MockElection
  ) {}

  on(event: "error", callback: (error: any) => void): Campaign;
  on(event: "elected", callback: () => void): Campaign;
  on(event: string, callback: any): Campaign {
    if (event === "error") {
      this.errorCallbacks.push(callback);
    } else if (event === "elected") {
      this.electedCallbacks.push(callback);
    }
    return this;
  }

  notifyElected(): void {
    if (!this.resigned) {
      for (const callback of this.electedCallbacks) {
        callback();
      }
    }
  }

  notifyError(error: any): void {
    for (const callback of this.errorCallbacks) {
      callback(error);
    }
  }

  async resign(): Promise<void> {
    this.resigned = true;
  }
}

