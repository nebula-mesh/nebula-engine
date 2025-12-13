import winston, { format } from "winston";

let TestHook: ((msg: string) => void) | null = null;

export function setTestHook(hook: (msg: string) => void) {
  TestHook = hook;
}

// 自定义日志格式，使输出更美观
const customFormat = format.printf((info) => {
  const { level, timestamp, message, ...meta } = info;
  const splat = info[Symbol.for("splat")] as any[] | undefined;
  
  // 构建基础消息
  let msg = `${timestamp} [${level}] ${message}`;
  
  // 添加额外的元数据
  if (splat && Array.isArray(splat) && splat.length > 0) {
    const metaStr = splat
      .map((item: any) => {
        if (item instanceof Error) {
          return item.stack || item.message;
        }
        if (typeof item === "object") {
          return JSON.stringify(item, null, 2);
        }
        return String(item);
      })
      .join("\n");
    msg += `\n${metaStr}`;
  }
  
  // 添加其他元数据
  const metaKeys = Object.keys(meta).filter(
    (key) => key !== Symbol.for("splat").toString()
  );
  if (metaKeys.length > 0) {
    const metaObj: Record<string, any> = {};
    for (const key of metaKeys) {
      metaObj[key] = meta[key];
    }
    msg += `\n${JSON.stringify(metaObj, null, 2)}`;
  }
  
  if (TestHook) {
    TestHook(msg);
  }
  
  return msg;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  transports: [
    new winston.transports.Console({
      format: format.combine(
        format.colorize({ all: true }),
        format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
        customFormat
      ),
    }),
  ],
});

export default logger;
