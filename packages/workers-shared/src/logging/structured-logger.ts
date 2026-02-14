/**
 * ログレベル
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * ログコンテキスト
 */
export interface LogContext {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

/**
 * 構造化ログを出力する（JSON形式）
 *
 * @param level - ログレベル
 * @param message - ログメッセージ
 * @param context - 追加のコンテキスト情報
 */
export function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  const logEntry: LogContext = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };

  const logFn =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;

  logFn(JSON.stringify(logEntry));
}

/**
 * デバッグログ
 */
export function debug(
  message: string,
  context?: Record<string, unknown>,
): void {
  log("debug", message, context);
}

/**
 * 情報ログ
 */
export function info(message: string, context?: Record<string, unknown>): void {
  log("info", message, context);
}

/**
 * 警告ログ
 */
export function warn(message: string, context?: Record<string, unknown>): void {
  log("warn", message, context);
}

/**
 * エラーログ
 */
export function error(
  message: string,
  errorObj?: Error,
  context?: Record<string, unknown>,
): void {
  log("error", message, {
    ...context,
    error: errorObj
      ? {
          message: errorObj.message,
          name: errorObj.name,
          stack: errorObj.stack,
        }
      : undefined,
  });
}
