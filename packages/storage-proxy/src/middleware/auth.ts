import { verifyCloudflareAccessJWT } from "@repo/workers-shared";
import type { Context, MiddlewareHandler } from "hono";
import type { HonoEnv } from "../types";

/**
 * Cloudflare Access JWT 検証ミドルウェア（多層防御）
 *
 * Service Binding 経由（CDN Worker から）のリクエストには JWT ヘッダが付かないためスキップ
 * パブリックインターネット経由のリクエストは JWT を検証
 *
 * @returns Hono ミドルウェア
 */
export function cfAccessAuthMiddleware(): MiddlewareHandler<HonoEnv> {
  return async (c: Context<HonoEnv>, next) => {
    const accessJwt = c.req.header("Cf-Access-Jwt-Assertion");

    if (!accessJwt) {
      // Service Binding 経由のリクエスト（JWT ヘッダなし）はそのまま通す
      return next();
    }

    // パブリックインターネット経由のリクエストは JWT を検証
    try {
      await verifyCloudflareAccessJWT(
        accessJwt,
        c.env.CF_ACCESS_TEAM_DOMAIN,
        c.env.CF_ACCESS_AUD,
      );
    } catch (error) {
      console.error("Cloudflare Access JWT検証に失敗しました:", error);
      return c.text("Forbidden", 403);
    }

    return next();
  };
}
