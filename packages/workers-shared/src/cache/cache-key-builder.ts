/**
 * 画像変換パラメータ（w, h, f, q）
 */
const TRANSFORM_PARAMS = ["w", "h", "f", "q"] as const;

/**
 * キャッシュキーを構築する
 * 許可されたクエリパラメータのみを含めることで、キャッシュポイズニング攻撃を防ぐ
 *
 * @param url - 元のリクエストURL
 * @param download - ダウンロードモードかどうか
 * @returns キャッシュキーとして使用するRequest
 */
export function buildCacheKey(url: string, download: boolean): Request {
  const src = new URL(url);
  const cacheUrl = new URL(src.origin + src.pathname);

  if (download) {
    // ダウンロードモードの場合はdownloadパラメータのみ
    cacheUrl.searchParams.set("download", "true");
  } else {
    // 変換パラメータを正規化してキャッシュキーに含める
    for (const param of TRANSFORM_PARAMS) {
      const value = src.searchParams.get(param);
      if (value === null) continue;

      // 正規化: 数値パラメータは Number() で、f は小文字化
      const normalized =
        param === "f" ? value.toLowerCase() : String(Number(value));
      cacheUrl.searchParams.set(param, normalized);
    }
  }

  return new Request(cacheUrl);
}
