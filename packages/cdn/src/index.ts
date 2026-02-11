import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import * as jose from "jose";

type Env = {
  AUTH_SECRET: string;
  AUTH_SALT: string;
  ALLOW_EMAILS: string;
  MEDIA_PROCESSOR_URL: string;
  STORAGE_PROXY: Service;
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

const ALLOWED_FORMATS = new Set(["jpg", "jpeg", "png", "webp", "avif"]);

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ".gif",
  ".bmp",
  ".tiff",
  ".tif",
]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".avi", ".webm", ".mkv"]);

type MediaType = "image" | "video" | "other";

// 拡張子からメディア種別を判定
function getMediaType(key: string): MediaType {
  const lastDot = key.lastIndexOf(".");
  if (lastDot === -1) return "other";
  const ext = key.substring(lastDot).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  return "other";
}

// オブジェクトキーのバリデーション（パストラバーサル防止）
function validateKey(key: string): string | null {
  if (!key) {
    return "key is required";
  }
  if (key.length > 1024) {
    return "key too long (max: 1024)";
  }

  const decoded = decodeURIComponent(key);

  // ホワイトリスト: 英数字、スラッシュ、ハイフン、アンダースコア、ドットのみ
  if (!/^[a-zA-Z0-9/\-_.]+$/.test(decoded)) {
    return "key contains invalid characters";
  }

  if (
    decoded.includes("..") ||
    decoded.startsWith("/") ||
    decoded.includes("//") ||
    decoded.includes("\\")
  ) {
    return "invalid key: path traversal detected";
  }

  return null;
}

// クエリパラメータのバリデーション
function validateQuery(query: Record<string, string>): string | null {
  if (query.w !== undefined) {
    const w = Number(query.w);
    if (!Number.isInteger(w) || w <= 0) {
      return "w must be a positive integer";
    }
  }

  if (query.h !== undefined) {
    const h = Number(query.h);
    if (!Number.isInteger(h) || h <= 0) {
      return "h must be a positive integer";
    }
  }

  if (query.f !== undefined) {
    if (!ALLOWED_FORMATS.has(query.f.toLowerCase())) {
      return `unsupported format '${query.f}'. supported: jpg, png, webp, avif`;
    }
  }

  if (query.q !== undefined) {
    const q = Number(query.q);
    if (!Number.isInteger(q) || q < 1 || q > 100) {
      return "q must be an integer between 1 and 100";
    }
  }

  return null;
}

// メディア配信エンドポイント
app.get("/images/*", async (c) => {
  const key = c.req.path.replace(/^\/images\//, "");

  const keyError = validateKey(key);
  if (keyError) {
    return c.json({ error: keyError }, 400);
  }

  const mediaType = getMediaType(key);

  if (mediaType === "image") {
    // 画像 → クエリバリデーション → Cloud Run (Media Processor)
    const query = c.req.query();
    const queryError = validateQuery(query);
    if (queryError) {
      return c.json({ error: queryError }, 400);
    }

    const originUrl = new URL(`/transform/${key}`, c.env.MEDIA_PROCESSOR_URL);
    originUrl.search = new URL(c.req.url).search;

    // TODO: Cache API チェック (#219)
    return fetch(originUrl, { headers: c.req.raw.headers });
  }

  // 動画/その他 → Storage Proxy (Service Binding)、変換パラメータは無視
  const storageUrl = new URL(c.req.url);
  storageUrl.pathname = `/${key}`;
  storageUrl.search = "";

  // TODO: Cache API チェック (#219)
  return c.env.STORAGE_PROXY.fetch(
    new Request(storageUrl, { headers: c.req.raw.headers }),
  );
});

export default app;
