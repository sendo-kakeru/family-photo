import type { Context, MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import type { HonoEnv } from "../types";

/**
 * CORS ミドルウェア（環境別オリジン設定）
 *
 * 本番環境は APP_HOST、開発環境は localhost:3000 を許可
 *
 * @returns Hono ミドルウェア
 */
export function corsMiddleware(): MiddlewareHandler<HonoEnv> {
  return async (c: Context<HonoEnv>, next) => {
    const allowedOrigins = [
      `https://${c.env.APP_HOST}`,
      "http://localhost:3000",
    ];

    const corsHandler = cors({
      allowHeaders: ["*"],
      allowMethods: ["GET", "HEAD"],
      origin: allowedOrigins,
    });

    return corsHandler(c, next);
  };
}
