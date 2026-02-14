import * as jose from "jose";
import type { Env } from "../types";

/**
 * Media Processor タイムアウト（30秒）
 */
const MEDIA_PROCESSOR_TIMEOUT_MS = 30_000;

/**
 * GCP サービスアカウント秘密鍵から OIDC トークンを取得する（キャッシュ付き）
 *
 * Workers グローバルキャッシュ（インスタンスのライフサイクル全体で保持）
 */
let cachedCryptoKey: {
  keyId: string;
  key: CryptoKey;
  clientEmail: string;
} | null = null;

let cachedOidcToken: {
  audience: string;
  token: string;
  expiresAt: number;
} | null = null;

/**
 * GCP サービスアカウント鍵から OIDC トークンを生成する
 *
 * @param saKeyJson - サービスアカウント鍵（JSON文字列）
 * @param audience - OIDC トークンの audience（Media Processor URL）
 * @returns OIDC トークン
 */
async function getOidcToken(
  saKeyJson: string,
  audience: string,
): Promise<string> {
  // キャッシュチェック（有効期限の5分前にリフレッシュ）
  const now = Math.floor(Date.now() / 1000);
  if (
    cachedOidcToken &&
    cachedOidcToken.audience === audience &&
    cachedOidcToken.expiresAt > now + 300
  ) {
    return cachedOidcToken.token;
  }

  // サービスアカウント鍵をパースし CryptoKey をキャッシュ
  const saKey: {
    client_email: string;
    private_key: string;
    private_key_id: string;
  } = JSON.parse(saKeyJson);

  let cryptoKey: CryptoKey;
  if (cachedCryptoKey?.keyId === saKey.private_key_id) {
    cryptoKey = cachedCryptoKey.key;
  } else {
    cryptoKey = (await jose.importPKCS8(
      saKey.private_key,
      "RS256",
    )) as CryptoKey;
    cachedCryptoKey = {
      clientEmail: saKey.client_email,
      key: cryptoKey,
      keyId: saKey.private_key_id,
    };
  }

  // 自己署名 JWT を生成（RS256）
  const jwt = await new jose.SignJWT({ target_audience: audience })
    .setProtectedHeader({
      alg: "RS256",
      kid: saKey.private_key_id,
      typ: "JWT",
    })
    .setIssuer(saKey.client_email)
    .setSubject(saKey.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(cryptoKey);

  // Google Token Endpoint で OIDC トークンに交換
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(
      `OIDC token exchange failed: ${tokenResponse.status} ${errorText}`,
    );
  }

  const tokenData = (await tokenResponse.json()) as { id_token: string };

  cachedOidcToken = {
    audience,
    expiresAt: now + 3600,
    token: tokenData.id_token,
  };

  return tokenData.id_token;
}

/**
 * Media Processor で画像を変換して取得する
 *
 * GCP_SERVICE_ACCOUNT_KEY が設定されている場合は OIDC トークンを付与
 * ローカル開発では認証なしでアクセスする
 *
 * @param env - Worker 環境変数
 * @param key - オブジェクトキー
 * @param headers - リクエストヘッダー
 * @param cacheKeyUrl - キャッシュキー URL（クエリパラメータ含む）
 * @returns Media Processor からのレスポンス
 */
export async function fetchFromMediaProcessor(
  env: Env,
  key: string,
  headers: Headers,
  cacheKeyUrl: string,
): Promise<Response> {
  const originUrl = new URL(`/transform/${key}`, env.MEDIA_PROCESSOR_URL);
  originUrl.search = new URL(cacheKeyUrl).search;

  const reqHeaders = new Headers(headers);

  // GCP_SERVICE_ACCOUNT_KEY が設定されている場合のみ OIDC トークンを付与
  // ローカル開発では media-processor に認証なしでアクセスする
  if (env.GCP_SERVICE_ACCOUNT_KEY) {
    const oidcToken = await getOidcToken(
      env.GCP_SERVICE_ACCOUNT_KEY,
      env.MEDIA_PROCESSOR_URL,
    );
    reqHeaders.set("Authorization", `Bearer ${oidcToken}`);
  }

  return fetch(originUrl, {
    headers: reqHeaders,
    signal: AbortSignal.timeout(MEDIA_PROCESSOR_TIMEOUT_MS),
  });
}
