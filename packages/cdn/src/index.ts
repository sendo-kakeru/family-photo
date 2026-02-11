import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import * as jose from "jose";

type Env = {
  AUTH_SECRET: string;
  AUTH_SALT: string;
  ALLOW_EMAILS: string;
  MEDIA_PROCESSOR_URL: string;
};

type HonoEnv = { Bindings: Env };

const app = new Hono<HonoEnv>();

// Workers グローバルキャッシュ（インスタンスのライフサイクル全体で保持）
let cachedKey: { secret: string; salt: string; key: Uint8Array } | null = null;
let cachedAllowEmails: { raw: string; emails: Set<string> } | null = null;

// next-auth (Auth.js v5) の暗号化鍵を HKDF で導出する（キャッシュ付き）
async function getDerivedEncryptionKey(
  secret: string,
  salt: string,
): Promise<Uint8Array> {
  if (cachedKey?.secret === secret && cachedKey?.salt === salt) {
    return cachedKey.key;
  }

  const encoder = new TextEncoder();
  const ikm = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HKDF" },
    false,
    ["deriveBits"],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      hash: "SHA-256",
      info: encoder.encode("Auth.js Generated Encryption Key"),
      name: "HKDF",
      salt: encoder.encode(salt),
    },
    ikm,
    512, // 64 bytes for A256CBC-HS512
  );

  const key = new Uint8Array(derivedBits);
  cachedKey = { key, salt, secret };
  return key;
}

// ALLOW_EMAILS を Set にパースする（キャッシュ付き）
function getAllowEmails(raw: string): Set<string> {
  if (cachedAllowEmails?.raw === raw) {
    return cachedAllowEmails.emails;
  }

  const emails = new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
  cachedAllowEmails = { emails, raw };
  return emails;
}

// ヘルスチェック（認証不要）
app.get("/health", (c) => {
  return c.text("ok");
});

// next-auth JWT 検証ミドルウェア
app.use("*", async (c, next) => {
  // Cookie から JWT を取得（本番: __Secure- prefix、開発: prefix なし）
  const token =
    getCookie(c, "__Secure-authjs.session-token") ??
    getCookie(c, "authjs.session-token");

  if (!token) {
    return c.text("Unauthorized", 401);
  }

  let email: string;
  try {
    const key = await getDerivedEncryptionKey(
      c.env.AUTH_SECRET,
      c.env.AUTH_SALT,
    );
    const { payload } = await jose.jwtDecrypt(token, key, {
      clockTolerance: 15,
    });

    if (typeof payload.email !== "string" || !payload.email) {
      return c.text("Unauthorized", 401);
    }
    email = payload.email;
  } catch (error) {
    console.error(
      "JWT verification failed:",
      error instanceof Error ? error.message : String(error),
    );
    return c.text("Unauthorized", 401);
  }

  const allowEmails = getAllowEmails(c.env.ALLOW_EMAILS);
  if (!allowEmails.has(email.toLowerCase())) {
    return c.text("Unauthorized", 401);
  }

  return next();
});

export default app;
