import { Hono } from "hono";
import { handleMedia } from "./handlers/media";
import { authMiddleware } from "./middleware/auth";
import type { HonoEnv } from "./types";

const app = new Hono<HonoEnv>();

/**
 * ヘルスチェック（認証不要）
 */
app.get("/health", (c) => {
  return c.text("ok");
});

/**
 * next-auth JWT 検証ミドルウェア（全ルートに適用）
 */
app.use("*", authMiddleware());

/**
 * GET: メディア配信（ボディ付きレスポンス）
 */
app.get("/images/*", handleMedia);

/**
 * HEAD: メディアヘッダー取得（キャッシュプライミング）
 */
app.on("HEAD", "/images/*", async (c) => {
  const response = await handleMedia(c);
  return new Response(null, {
    headers: response.headers,
    status: response.status,
  });
});

export default app;
