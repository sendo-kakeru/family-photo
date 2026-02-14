import { Hono } from "hono";
import { handleProxy } from "./handlers/proxy";
import { cfAccessAuthMiddleware } from "./middleware/auth";
import { cacheHeadersMiddleware } from "./middleware/cache-headers";
import { corsMiddleware } from "./middleware/cors";
import type { HonoEnv } from "./types";

const app = new Hono<HonoEnv>();

/**
 * キャッシュヘッダーミドルウェア（全ルートに適用）
 */
app.use("*", cacheHeadersMiddleware());

/**
 * Cloudflare Access JWT 検証ミドルウェア（多層防御）
 */
app.use("*", cfAccessAuthMiddleware());

/**
 * CORS ミドルウェア
 */
app.use("*", corsMiddleware());

/**
 * GET: B2 ストレージからファイルを取得
 */
app.get("*", (c) => handleProxy(c, "GET"));

/**
 * HEAD: B2 ストレージのファイルメタデータを取得
 */
app.on("HEAD", "*", (c) => handleProxy(c, "HEAD"));

/**
 * その他のメソッドは拒否
 */
app.all("*", (c) => {
  return c.text("Method Not Allowed", 405);
});

export default app;
