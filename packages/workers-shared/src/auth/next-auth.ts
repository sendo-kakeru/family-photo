import * as jose from "jose";

/**
 * 暗号化鍵のキャッシュ
 */
let cachedKey: {
  secret: string;
  salt: string;
  key: Uint8Array;
} | null = null;

/**
 * next-auth (Auth.js v5) の暗号化鍵を HKDF で導出する（キャッシュ付き）
 */
export async function getDerivedEncryptionKey(
  secret: string,
  salt: string,
): Promise<Uint8Array> {
  // キャッシュチェック
  if (cachedKey?.secret === secret && cachedKey?.salt === salt) {
    return cachedKey.key;
  }

  const encoder = new TextEncoder();

  // HKDF で暗号化鍵を導出
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
      info: encoder.encode(`Auth.js Generated Encryption Key (${salt})`),
      name: "HKDF",
      salt: encoder.encode(salt),
    },
    ikm,
    512, // 64 bytes for A256CBC-HS512
  );

  const key = new Uint8Array(derivedBits);

  // キャッシュに保存
  cachedKey = { key, salt, secret };

  return key;
}

/**
 * next-auth の JWT トークンを検証してペイロードを取得する
 */
export async function verifyNextAuthJWT(
  token: string,
  secret: string,
  salt: string,
): Promise<jose.JWTDecryptResult> {
  const key = await getDerivedEncryptionKey(secret, salt);

  return await jose.jwtDecrypt(token, key, {
    clockTolerance: 15,
  });
}

/**
 * JWT ペイロードからメールアドレスを抽出する
 */
export function extractEmailFromPayload(
  payload: jose.JWTPayload,
): string | null {
  if (typeof payload.email === "string" && payload.email) {
    return payload.email;
  }
  return null;
}
