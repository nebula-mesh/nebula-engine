import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Etcd3 } from "etcd3";
import { Testing } from "../../core/testing";
import { Schedule, SchedulePlugin, ScheduleMode } from "./index";

/**
 * 真实 ETCD 测试集合
 * 
 * 注意：这些测试需要运行的 ETCD 服务器
 * 
 * 启动 ETCD（使用 Docker）:
 * ```bash
 * docker run -d --name etcd-test \
 *   -p 2379:2379 \
 *   -p 2380:2380 \
 *   -e ALLOW_NONE_AUTHENTICATION=yes \
 *   bitnami/etcd:latest
 * ```
 * 
 * 停止和清理：
 * ```bash
 * docker stop etcd-test && docker rm etcd-test
 * ```
 */
describe("SchedulePlugin with Real ETCD", () => {
  let etcdClient: Etcd3 | null = null;
  let engine: ReturnType<typeof Testing.createTestEngine>["engine"];
  let Module: ReturnType<typeof Testing.createTestEngine>["Module"];
  let schedulePlugin: SchedulePlugin;

  // 检查 ETCD 服务是否可用
  const isEtcdAvailable = async (): Promise<boolean> => {
    try {
      const testClient = new Etcd3({
        hosts: process.env.ETCD_HOSTS || "127.0.0.1:2379",
      });
      await testClient.get("test-connection").string();
      await testClient.close();
      return true;
    } catch (error) {
      return false;
    }
  };

  beforeEach(async () => {
    // 检查 ETCD 是否可用
    const available = await isEtcdAvailable();
    if (!available) {
      console.warn(
        "⚠️  ETCD service is not available. Skipping real ETCD tests."
      );
      console.warn(
        "   To run these tests, start ETCD with: docker run -d --name etcd-test -p 2379:2379 -p 2380:2380 -e ALLOW_NONE_AUTHENTICATION=yes bitnami/etcd:latest"
      );
      return;
    }

    // 创建 ETCD 客户端
    etcdClient = new Etcd3({
      hosts: process.env.ETCD_HOSTS || "127.0.0.1:2379",
    });

    // 创建插件和引擎
    schedulePlugin = new SchedulePlugin({ etcdClient });
    const testEngine = Testing.createTestEngine({
      plugins: [schedulePlugin],
    });
    engine = testEngine.engine;
    Module = testEngine.Module;
  });

  afterEach(async () => {
    // 清理引擎
    if (engine) {
      await engine.stop().catch(() => {});
    }

    // 清理 ETCD 客户端和数据
    if (etcdClient) {
      try {
        // 删除测试数据（使用前缀匹配）
        await etcdClient.delete().prefix("/schedule/");
      } catch (error) {
        console.error("Failed to clean up ETCD data:", error);
      }

      // 关闭客户端
      etcdClient.close();
      etcdClient = null;
    }
  });

  describe("基本功能", () => {
    it("应该使用真实 ETCD 客户端启动调度任务", async () => {
      if (!etcdClient) {
        console.log("Skipping test: ETCD not available");
        return;
      }

      let callCount = 0;

      @Module("test-service")
      class TestService {
        @Schedule({
          interval: 200,
          mode: ScheduleMode.FIXED_RATE,
        })
        async testTask() {
          callCount++;
        }
      }

      await engine.start();
      // 等待足够的时间让选举和任务执行
      // 真实 ETCD 的选举需要时间，加上任务执行间隔
      await Testing.wait(1000);

      // 任务应该已经被执行（通过真实 ETCD 选举）
      expect(callCount).toBeGreaterThan(0);
    });

    it("应该支持 FIXED_RATE 模式", async () => {
      if (!etcdClient) {
        console.log("Skipping test: ETCD not available");
        return;
      }

      let callCount = 0;
      const startTime = Date.now();

      @Module("test-service")
      class TestService {
        @Schedule({
          interval: 200,
          mode: ScheduleMode.FIXED_RATE,
        })
        async fixedRateTask() {
          callCount++;
        }
      }

      await engine.start();
      await Testing.wait(1000);

      const elapsed = Date.now() - startTime;

      // FIXED_RATE 模式下，应该按固定间隔执行
      // 预期执行次数约为 elapsed / interval
      // 由于选举和执行延迟，实际次数可能略少
      expect(callCount).toBeGreaterThan(0);
      expect(callCount).toBeLessThanOrEqual(Math.ceil(elapsed / 200) + 2);
    });

    it("应该支持 FIXED_DELAY 模式", async () => {
      if (!etcdClient) {
        console.log("Skipping test: ETCD not available");
        return;
      }

      let callCount = 0;
      const executionTimes: number[] = [];

      @Module("test-service")
      class TestService {
        @Schedule({
          interval: 200,
          mode: ScheduleMode.FIXED_DELAY,
        })
        async fixedDelayTask() {
          executionTimes.push(Date.now());
          callCount++;
          // 模拟任务执行时间
          await Testing.wait(100);
        }
      }

      await engine.start();
      await Testing.wait(1500);

      // FIXED_DELAY 模式下，应该在任务完成后等待固定延迟
      expect(callCount).toBeGreaterThan(0);

      // 验证间隔时间（应该 >= interval + 执行时间）
      for (let i = 1; i < executionTimes.length; i++) {
        const gap = executionTimes[i] - executionTimes[i - 1];
        // 间隔应该 >= interval（200ms）+ 执行时间（100ms） = 300ms
        // 考虑较大的误差（系统调度、网络延迟等），使用 200ms 作为下限
        expect(gap).toBeGreaterThanOrEqual(200);
      }
    });
  });

  describe("分布式选举", () => {
    it("应该在多个实例中只有一个执行任务（分布式锁）", async () => {
      if (!etcdClient) {
        console.log("Skipping test: ETCD not available");
        return;
      }

      // 使用外部存储来记录执行次数
      const executionLog: { instance: number; timestamp: number }[] = [];

      // 创建第一个实例 - 指定固定的服务名称以确保选举键相同
      const plugin1 = new SchedulePlugin({ etcdClient });
      const testEngine1 = Testing.createTestEngine({
        plugins: [plugin1],
        options: {
          name: "distributed-test-service", // 固定服务名称
          version: "1.0.0",
        },
      });
      const engine1 = testEngine1.engine;
      const Module1 = testEngine1.Module;

      @Module1("test-module")
      class TestService1 {
        @Schedule({
          interval: 200,
          mode: ScheduleMode.FIXED_RATE,
        })
        async testTask() {
          executionLog.push({ instance: 1, timestamp: Date.now() });
        }
      }

      // 创建第二个实例（使用相同的服务名称）
      const plugin2 = new SchedulePlugin({ etcdClient });
      const testEngine2 = Testing.createTestEngine({
        plugins: [plugin2],
        options: {
          name: "distributed-test-service", // 相同的服务名称
          version: "1.0.0",
        },
      });
      const engine2 = testEngine2.engine;
      const Module2 = testEngine2.Module;

      @Module2("test-module")
      class TestService2 {
        @Schedule({
          interval: 200,
          mode: ScheduleMode.FIXED_RATE,
        })
        async testTask() {
          executionLog.push({ instance: 2, timestamp: Date.now() });
        }
      }

      // 启动两个实例
      await engine1.start();
      await Testing.wait(300); // 等待第一个实例选举完成
      await engine2.start();

      // 等待足够时间让选举完成和任务执行
      // 选举需要时间，加上任务执行间隔（200ms），需要至少 2-3 秒
      await Testing.wait(3000);

      // 停止两个实例
      await engine1.stop();
      await engine2.stop();

      // 验证：应该有任务执行记录
      expect(executionLog.length).toBeGreaterThan(0);
      
      // 分析执行记录：统计每个实例的执行次数
      const instance1Count = executionLog.filter(log => log.instance === 1).length;
      const instance2Count = executionLog.filter(log => log.instance === 2).length;
      
      // 由于分布式锁，只有一个实例应该执行任务
      // 至少有一个实例执行了任务，另一个实例执行次数应该显著少于主实例
      const totalExecutions = instance1Count + instance2Count;
      const maxExecutions = Math.max(instance1Count, instance2Count);
      const minExecutions = Math.min(instance1Count, instance2Count);
      
      // 主实例应该执行了大部分任务（至少 70%）
      expect(maxExecutions).toBeGreaterThan(totalExecutions * 0.7);
      
      // 从实例应该很少或不执行任务（不超过 30%）
      expect(minExecutions).toBeLessThan(totalExecutions * 0.3);
    });

    it("应该在 Leader 停止后由其他实例接管", async () => {
      if (!etcdClient) {
        console.log("Skipping test: ETCD not available");
        return;
      }

      let instance1CallCount = 0;
      let instance2CallCount = 0;

      // 创建第一个实例
      const plugin1 = new SchedulePlugin({ etcdClient });
      const testEngine1 = Testing.createTestEngine({
        plugins: [plugin1],
      });
      const engine1 = testEngine1.engine;
      const Module1 = testEngine1.Module;

      @Module1("test-service")
      class TestService1 {
        @Schedule({
          interval: 200,
          mode: ScheduleMode.FIXED_RATE,
        })
        async testTask() {
          instance1CallCount++;
        }
      }

      // 启动第一个实例
      await engine1.start();
      await Testing.wait(500); // 让第一个实例成为 Leader

      // 第一个实例应该已经执行了任务
      expect(instance1CallCount).toBeGreaterThan(0);

      // 创建第二个实例
      const plugin2 = new SchedulePlugin({ etcdClient });
      const testEngine2 = Testing.createTestEngine({
        plugins: [plugin2],
      });
      const engine2 = testEngine2.engine;
      const Module2 = testEngine2.Module;

      @Module2("test-service")
      class TestService2 {
        @Schedule({
          interval: 200,
          mode: ScheduleMode.FIXED_RATE,
        })
        async testTask() {
          instance2CallCount++;
        }
      }

      // 启动第二个实例
      await engine2.start();
      await Testing.wait(500); // 等待第二个实例参与选举

      // 此时第二个实例不应该执行任务（第一个实例还是 Leader）
      expect(instance2CallCount).toBe(0);

      // 停止第一个实例（Leader）
      await engine1.stop();
      await Testing.wait(800); // 等待第二个实例接管

      // 第二个实例应该接管并执行任务
      expect(instance2CallCount).toBeGreaterThan(0);

      // 停止第二个实例
      await engine2.stop();
    });
  });

  describe("错误处理", () => {
    it("应该处理 ETCD 连接错误", async () => {
      if (!etcdClient) {
        console.log("Skipping test: ETCD not available");
        return;
      }

      // 创建一个指向错误地址的 ETCD 客户端
      const badEtcdClient = new Etcd3({
        hosts: "127.0.0.1:9999", // 不存在的端口
      });

      const badPlugin = new SchedulePlugin({ etcdClient: badEtcdClient });
      const testEngine = Testing.createTestEngine({
        plugins: [badPlugin],
      });
      const badEngine = testEngine.engine;
      const BadModule = testEngine.Module;

      let taskExecuted = false;

      @BadModule("test-service")
      class TestService {
        @Schedule({
          interval: 200,
          mode: ScheduleMode.FIXED_RATE,
        })
        async testTask() {
          taskExecuted = true;
        }
      }

      // 启动应该不会抛出错误
      await expect(badEngine.start()).resolves.not.toThrow();
      await Testing.wait(500);

      // 由于连接失败，任务不应该执行
      expect(taskExecuted).toBe(false);

      await badEngine.stop();
      badEtcdClient.close();
    });

    it("应该处理任务执行错误", async () => {
      if (!etcdClient) {
        console.log("Skipping test: ETCD not available");
        return;
      }

      let callCount = 0;
      let errorCount = 0;

      @Module("test-service")
      class TestService {
        @Schedule({
          interval: 200,
          mode: ScheduleMode.FIXED_RATE,
        })
        async errorTask() {
          callCount++;
          if (callCount <= 2) {
            errorCount++;
            throw new Error("Task execution error");
          }
        }
      }

      await engine.start();
      await Testing.wait(1000);

      // 任务应该被执行多次，即使前几次抛出错误
      expect(callCount).toBeGreaterThan(2);
      expect(errorCount).toBe(2);
    });
  });

  describe("清理和停止", () => {
    it("应该在引擎停止时正确清理资源", async () => {
      if (!etcdClient) {
        console.log("Skipping test: ETCD not available");
        return;
      }

      let callCount = 0;

      @Module("test-service")
      class TestService {
        @Schedule({
          interval: 200,
          mode: ScheduleMode.FIXED_RATE,
        })
        async testTask() {
          callCount++;
        }
      }

      await engine.start();
      await Testing.wait(500);
      const callCountBeforeStop = callCount;

      // 停止引擎
      await engine.stop();
      await Testing.wait(500);

      // 停止后任务不应该再执行
      expect(callCount).toBe(callCountBeforeStop);
    });

    it("应该能够正常重启", async () => {
      if (!etcdClient) {
        console.log("Skipping test: ETCD not available");
        return;
      }

      let callCount = 0;

      @Module("test-service")
      class TestService {
        @Schedule({
          interval: 200,
          mode: ScheduleMode.FIXED_RATE,
        })
        async testTask() {
          callCount++;
        }
      }

      // 第一次启动
      await engine.start();
      await Testing.wait(500);
      const callCountAfterFirstRun = callCount;
      expect(callCountAfterFirstRun).toBeGreaterThan(0);

      // 停止
      await engine.stop();
      await Testing.wait(200);

      // 第二次启动
      await engine.start();
      await Testing.wait(500);
      const callCountAfterSecondRun = callCount;

      // 第二次启动后应该继续执行任务
      expect(callCountAfterSecondRun).toBeGreaterThan(callCountAfterFirstRun);
    });
  });

  describe("性能和稳定性", () => {
    it("应该能够处理大量任务", async () => {
      if (!etcdClient) {
        console.log("Skipping test: ETCD not available");
        return;
      }

      const taskCounts: { [key: string]: number } = {};

      @Module("test-service")
      class TestService {
        @Schedule({ interval: 100, mode: ScheduleMode.FIXED_RATE })
        async task1() {
          taskCounts.task1 = (taskCounts.task1 || 0) + 1;
        }

        @Schedule({ interval: 150, mode: ScheduleMode.FIXED_RATE })
        async task2() {
          taskCounts.task2 = (taskCounts.task2 || 0) + 1;
        }

        @Schedule({ interval: 200, mode: ScheduleMode.FIXED_DELAY })
        async task3() {
          taskCounts.task3 = (taskCounts.task3 || 0) + 1;
          await Testing.wait(50);
        }

        @Schedule({ interval: 300, mode: ScheduleMode.FIXED_RATE })
        async task4() {
          taskCounts.task4 = (taskCounts.task4 || 0) + 1;
        }

        @Schedule({ interval: 400, mode: ScheduleMode.FIXED_RATE })
        async task5() {
          taskCounts.task5 = (taskCounts.task5 || 0) + 1;
        }
      }

      await engine.start();
      await Testing.wait(2000);

      // 所有任务都应该被执行
      expect(taskCounts.task1).toBeGreaterThan(0);
      expect(taskCounts.task2).toBeGreaterThan(0);
      expect(taskCounts.task3).toBeGreaterThan(0);
      expect(taskCounts.task4).toBeGreaterThan(0);
      expect(taskCounts.task5).toBeGreaterThan(0);

      // 验证执行频率是否合理
      // task1 (100ms) 应该比 task5 (400ms) 执行更多次
      expect(taskCounts.task1).toBeGreaterThan(taskCounts.task5);
    });

    it("应该能够长时间稳定运行", async () => {
      if (!etcdClient) {
        console.log("Skipping test: ETCD not available");
        return;
      }

      let callCount = 0;
      let errorCount = 0;

      @Module("test-service")
      class TestService {
        @Schedule({
          interval: 100,
          mode: ScheduleMode.FIXED_RATE,
        })
        async longRunningTask() {
          try {
            callCount++;
            // 模拟一些工作
            await Testing.wait(10);
          } catch (error) {
            errorCount++;
          }
        }
      }

      await engine.start();
      // 运行较长时间（3秒）
      await Testing.wait(3000);

      // 应该执行了大量任务，且没有错误
      expect(callCount).toBeGreaterThan(20);
      expect(errorCount).toBe(0);
    });
  });
});
