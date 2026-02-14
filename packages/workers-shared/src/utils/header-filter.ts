/**
 * 許可されたヘッダーのリスト
 */
const DEFAULT_ALLOWED_HEADERS = [
  "range",
  "if-none-match",
  "if-modified-since",
  "accept",
  "accept-encoding",
] as const;

/**
 * リクエストヘッダーをフィルタリングする
 * ブラウザ固有のヘッダー（cookie, sec-fetch-*等）を除外し、
 * 許可されたヘッダーのみを転送する
 *
 * @param headers - 元のヘッダー
 * @param allowedHeaders - 許可するヘッダー名のリスト
 * @returns フィルタリング後のヘッダー
 */
export function filterHeaders(
  headers: Headers,
  allowedHeaders: readonly string[] = DEFAULT_ALLOWED_HEADERS,
): Headers {
  const filtered = new Headers();

  // 小文字化して比較
  const allowedSet = new Set(allowedHeaders.map((h) => h.toLowerCase()));

  for (const [key, value] of headers.entries()) {
    if (allowedSet.has(key.toLowerCase())) {
      filtered.set(key, value);
    }
  }

  return filtered;
}

/**
 * 環境変数から許可ヘッダーリストを読み込み、フィルタリングする
 *
 * @param headers - 元のヘッダー
 * @param allowedHeadersEnv - カンマ区切りの許可ヘッダーリスト
 * @returns フィルタリング後のヘッダー
 */
export function filterHeadersFromEnv(
  headers: Headers,
  allowedHeadersEnv?: string[],
): Headers {
  if (!allowedHeadersEnv || allowedHeadersEnv.length === 0) {
    return filterHeaders(headers);
  }

  return filterHeaders(headers, allowedHeadersEnv);
}
