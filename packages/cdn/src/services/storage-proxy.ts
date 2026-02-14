import { filterHeaders } from "@repo/workers-shared";
import type { Env } from "../types";

/**
 * Storage Proxy からオリジナルファイルを取得する
 *
 * ブラウザヘッダー（cookie, sec-fetch-* 等）を転送すると B2 の署名検証が失敗するため、
 * Range ヘッダーのみ転送する
 *
 * STORAGE_PROXY_URL が設定されている場合は直接 HTTP（ローカル開発用）
 *
 * @param env - Worker 環境変数
 * @param url - リクエスト URL
 * @param key - オブジェクトキー
 * @param headers - リクエストヘッダー
 * @returns Storage Proxy からのレスポンス
 */
export function fetchFromStorageProxy(
  env: Env,
  url: string,
  key: string,
  headers: Headers,
): Promise<Response> {
  // Range ヘッダーのみを転送（ブラウザヘッダーを除外）
  const proxyHeaders = filterHeaders(headers, ["range"]);

  // STORAGE_PROXY_URL が設定されている場合は直接 HTTP（ローカル開発用）
  if (env.STORAGE_PROXY_URL) {
    const directUrl = new URL(`/${key}`, env.STORAGE_PROXY_URL);
    return fetch(directUrl, { headers: proxyHeaders });
  }

  // Service Binding 経由でアクセス
  const storageUrl = new URL(url);
  storageUrl.pathname = `/${key}`;
  storageUrl.search = "";

  return env.STORAGE_PROXY.fetch(
    new Request(storageUrl, { headers: proxyHeaders }),
  );
}
