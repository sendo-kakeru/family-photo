import type { MiddlewareHandler } from "hono";
import type { HonoEnv } from "../types";

/**
 * キャッシュヘッダーミドルウェア（メディアファイル用）
 *
 * - 長期キャッシュ設定（1年）
 * - Vary ヘッダー設定（Accept-Encoding, Accept）
 * - Range リクエスト対応（Accept-Ranges: bytes）
 * - Last-Modified ヘッダー設定
 *
 * @returns Hono ミドルウェア
 */
export function cacheHeadersMiddleware(): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    await next();

    // 304 Not Modified はヘッダを変更しない
    if (c.res.status === 304) {
      return;
    }

    // メディアファイルには長期キャッシュを設定
    c.res.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    c.res.headers.set("Vary", "Accept-Encoding, Accept");
    c.res.headers.set("Accept-Ranges", "bytes");

    // Last-Modified がない場合は設定
    if (!c.res.headers.has("Last-Modified")) {
      c.res.headers.set("Last-Modified", new Date().toUTCString());
    }
  };
}
