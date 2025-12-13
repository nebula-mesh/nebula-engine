import { SpanStatusCode, trace } from "@opentelemetry/api";
import logger from "../../core/logger";
import { ScheduleMetadata, ScheduleMode } from "./types";
import { Etcd3 } from "./types";

const tracer = trace.getTracer("scheduler");

/**
 * 调度器类
 * 负责管理基于 etcd 选举的分布式定时任务
 */
export class Scheduler {
  private campaigns: Map<string, any> = new Map();
  private timers: Map<
    string,
    ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>
  > = new Map();
  private isLeader: Map<string, boolean> = new Map();

  constructor(private etcdClient: Etcd3) {
    // etcdClient 必须实现 Etcd3 接口
  }

  /**
   * 启动调度任务
   */
  async startSchedule(
    serviceId: string,
    moduleName: string,
    methodName: string,
    electionKey: string,
    metadata: ScheduleMetadata,
    method: Function
  ) {
    const election = this.etcdClient.election(electionKey, 10);
    const observe = await election.observe();

    // 监听选主结果
    observe.on("change", (leader: string | undefined) => {
      const isLeader = leader === serviceId;
      this.isLeader.set(serviceId, isLeader);

      if (!isLeader) {
        this.stopTimer(serviceId);
      }
    });

    // 开始参与选主
    const campaign = election.campaign(serviceId);
    this.campaigns.set(serviceId, campaign);

    campaign.on("error", (error: any) => {
      logger.error(`Error in campaign for ${moduleName}.${methodName}:`, error);
    });

    campaign.on("elected", () => {
      this.isLeader.set(serviceId, true);
      this.startTimer(serviceId, metadata, moduleName, method);

      logger.info(`become leader for ${moduleName}.${methodName}`);
    });
  }

  /**
   * 启动定时器
   */
  private startTimer(
    serviceId: string,
    metadata: ScheduleMetadata,
    moduleName: string,
    method: Function
  ) {
    this.stopTimer(serviceId);

    const wrappedMethod = async () => {
      tracer.startActiveSpan(
        `ScheduleTask ${moduleName}.${metadata.name}`,
        { root: true },
        async (span) => {
          span.setAttribute("serviceId", serviceId);
          span.setAttribute("methodName", metadata.name);
          span.setAttribute("moduleName", moduleName);
          span.setAttribute("interval", metadata.interval);
          span.setAttribute("mode", metadata.mode!);
          try {
            await method();
          } catch (error: any) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error.message,
            });
            logger.error(
              `Error executing schedule task ${moduleName}.${metadata.name}:`,
              error
            );
          } finally {
            span.setStatus({ code: SpanStatusCode.OK });
            span.end();
          }
        }
      );
    };

    if (metadata.mode === ScheduleMode.FIXED_DELAY) {
      const runTask = async () => {
        if (!this.isLeader.get(serviceId)) return;

        try {
          await wrappedMethod();
        } finally {
          // 任务完成后等待间隔时间再执行下一次
          this.timers.set(serviceId, setTimeout(runTask, metadata.interval));
        }
      };

      // 立即执行第一次
      runTask();
    } else {
      // 固定频率模式
      this.timers.set(
        serviceId,
        setInterval(async () => {
          if (!this.isLeader.get(serviceId)) return;
          await wrappedMethod();
        }, metadata.interval)
      );
    }
  }

  /**
   * 停止定时器
   */
  private stopTimer(serviceId: string) {
    const timer = this.timers.get(serviceId);
    if (timer) {
      clearTimeout(timer);
      clearInterval(timer);
      this.timers.delete(serviceId);
    }
  }

  /**
   * 停止所有调度任务
   */
  async stop() {
    // 停止所有定时器
    for (const serviceId of this.timers.keys()) {
      this.stopTimer(serviceId);
    }

    // 放弃所有选主并撤销租约
    for (const [serviceId, campaign] of this.campaigns.entries()) {
      try {
        await campaign.resign().catch(() => {});
      } catch (error) {
        logger.error(`Error stopping schedule ${serviceId}:`, error);
      } finally {
        this.campaigns.delete(serviceId);
        this.isLeader.delete(serviceId);
      }
    }
  }
}

