import {
  AuthenticationError,
  extractEmailFromPayload,
  getAllowEmails,
  isEmailAllowed,
  verifyNextAuthJWT,
} from "@repo/workers-shared";
import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { HonoEnv } from "../types";

/**
 * next-auth (Auth.js v5) JWT 検証ミドルウェア
 *
 * Cookie から JWT を取得し、HKDF で導出した鍵で復号化、メールアドレスを検証
 *
 * @returns Hono ミドルウェア
 */
export function authMiddleware(): MiddlewareHandler<HonoEnv> {
  return async (c: Context<HonoEnv>, next) => {
    // Cookie から JWT を取得（本番: __Secure- prefix、開発: prefix なし）
    const token =
      getCookie(c, "__Secure-authjs.session-token") ??
      getCookie(c, "authjs.session-token");

    if (!token) {
      return c.json({ error: "認証に失敗しました" }, 401);
    }

    try {
      // HKDF で導出した鍵で JWT を復号化
      const result = await verifyNextAuthJWT(
        token,
        c.env.AUTH_SECRET,
        c.env.AUTH_SALT,
      );

      // ペイロードからメールアドレスを抽出
      const email = extractEmailFromPayload(result.payload);

      if (!email) {
        return c.json({ error: "認証に失敗しました" }, 401);
      }

      // メールアドレスが許可リストに含まれるか確認
      const allowEmails = getAllowEmails(c.env.ALLOW_EMAILS);
      if (!isEmailAllowed(email, allowEmails)) {
        return c.json({ error: "認証に失敗しました" }, 401);
      }

      // 認証成功
      return next();
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return c.json({ error: error.message }, 401);
      }

      console.error(
        "JWT検証に失敗しました:",
        error instanceof Error ? error.name : "不明なエラー",
      );
      return c.json({ error: "認証に失敗しました" }, 401);
    }
  };
}
