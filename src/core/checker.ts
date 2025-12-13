import logger from "./logger";

export interface PreStartChecker {
  name: string;
  check: () => Promise<void> | void;
  skip?: boolean;
}

export async function startCheck(
  checkers: PreStartChecker[],
  pass?: () => void | Promise<void>
) {
  logger.info("[ 预检开始 ]");

  for (const [index, checker] of checkers.entries()) {
    const seq = index + 1;
    logger.info(`${seq}. ${checker.name}`);
    try {
      if (checker.skip) {
        logger.warn(`${seq}. ${checker.name} [跳过]`);
        continue;
      }
      await checker.check();
      logger.info(`${seq}. ${checker.name} [成功]`);
    } catch (error) {
      logger.error(`${seq}. ${checker.name} [失败]`);
      throw error;
    }
  }

  logger.info("[ 预检完成 ]");
  if (pass) await pass();
}
