import {
  buildCacheKey,
  createContentDisposition,
  inferMediaType,
  type MediaType,
  ValidationError,
  validateKey,
  validateQueryParams,
} from "@repo/workers-shared";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { fetchFromMediaProcessor } from "../services/media-processor";
import { fetchFromStorageProxy } from "../services/storage-proxy";
import type { HonoEnv } from "../types";

/**
 * オリジンエラーレスポンスを適切な CDN エラーにマッピング
 *
 * @param status - オリジンのステータスコード
 * @returns エラーメッセージとステータスコード
 */
function mapOriginError(status: number): { message: string; status: number } {
  switch (status) {
    case 404:
      return { message: "指定されたメディアが見つかりません", status: 404 };
    case 422:
      return { message: "メディアの変換に失敗しました", status: 422 };
    case 500:
      return {
        message: "メディアの取得に失敗しました",
        status: 502,
      };
    default:
      console.error(`予期しないオリジンステータス: ${status}`);
      return {
        message: "メディアの取得に失敗しました",
        status: 502,
      };
  }
}

/**
 * キャッシュから取得を試みる
 *
 * @param cacheKey - キャッシュキー
 * @returns キャッシュヒット時はレスポンス、ミス時は null
 */
async function getCachedMedia(cacheKey: Request): Promise<Response | null> {
  const cache = caches.default;
  const cachedResponse = await cache.match(cacheKey);

  if (cachedResponse) {
    const response = new Response(cachedResponse.body, cachedResponse);
    response.headers.set("X-Cache", "HIT");
    return response;
  }

  return null;
}

/**
 * オリジンからメディアを取得する
 *
 * download=true の場合は Storage Proxy から取得
 * 画像の場合はクエリパラメータを検証し、Media Processor で変換
 * その他の場合は Storage Proxy から取得
 *
 * @param c - Hono コンテキスト
 * @param key - オブジェクトキー
 * @param query - クエリパラメータ
 * @param download - ダウンロードモードか
 * @param mediaType - メディアタイプ
 * @param cacheKeyUrl - キャッシュキー URL
 * @returns オリジンレスポンス
 */
async function fetchMediaFromOrigin(
  c: Context<HonoEnv>,
  key: string,
  query: Record<string, string>,
  download: boolean,
  mediaType: MediaType,
  cacheKeyUrl: string,
): Promise<Response | { error: string; status: ContentfulStatusCode }> {
  // download=true の場合は Storage Proxy から取得
  if (download) {
    return fetchFromStorageProxy(c.env, c.req.url, key, c.req.raw.headers);
  }

  // 画像の場合はクエリパラメータを検証し、Media Processor で変換
  if (mediaType === "image") {
    try {
      const params = new URLSearchParams(
        Object.entries(query).filter(([, v]) => v !== undefined),
      );
      validateQueryParams(params);

      return await fetchFromMediaProcessor(
        c.env,
        key,
        c.req.raw.headers,
        cacheKeyUrl,
      );
    } catch (error) {
      if (error instanceof ValidationError) {
        return { error: error.message, status: 400 };
      }

      if (error instanceof DOMException && error.name === "TimeoutError") {
        return { error: "メディアの処理がタイムアウトしました", status: 504 };
      }

      console.error(
        "Media Processorへのリクエストに失敗しました:",
        error instanceof Error ? error.name : "不明なエラー",
      );
      return { error: "メディアの取得に失敗しました", status: 502 };
    }
  }

  // 動画/その他 → Storage Proxy
  return fetchFromStorageProxy(c.env, c.req.url, key, c.req.raw.headers);
}

/**
 * レスポンスをキャッシュして返す
 *
 * @param c - Hono コンテキスト
 * @param originResponse - オリジンレスポンス
 * @param key - オブジェクトキー
 * @param download - ダウンロードモードか
 * @param cacheKey - キャッシュキー
 * @returns キャッシュ可能なレスポンス
 */
async function cacheAndReturnMedia(
  c: Context<HonoEnv>,
  originResponse: Response,
  key: string,
  download: boolean,
  cacheKey: Request,
): Promise<Response> {
  // エラーレスポンスはキャッシュしない
  if (!originResponse.ok) {
    const originBody = await originResponse
      .text()
      .catch(() => "(読み取り失敗)");
    console.error(
      `オリジンエラー: status=${originResponse.status} key=${key} body=${originBody}`,
    );
    const { message, status } = mapOriginError(originResponse.status);
    return c.json({ error: message }, status as ContentfulStatusCode);
  }

  // キャッシュ用レスポンスを構築
  const responseHeaders = new Headers(originResponse.headers);
  responseHeaders.set("Cache-Control", "public, max-age=31536000, immutable");

  if (download) {
    const disposition = createContentDisposition(key, false);
    responseHeaders.set("Content-Disposition", disposition);
  }

  const cacheableResponse = new Response(originResponse.body, {
    headers: responseHeaders,
    status: originResponse.status,
  });

  // キャッシュ保存（レスポンス返却をブロックしない）
  const cache = caches.default;
  c.executionCtx.waitUntil(cache.put(cacheKey, cacheableResponse.clone()));

  // クライアントへのレスポンス
  cacheableResponse.headers.set("X-Cache", "MISS");

  return cacheableResponse;
}

/**
 * メディア配信ハンドラ
 *
 * 1. キャッシュチェック（HIT時は即座に返却）
 * 2. オリジンフェッチ（Storage Proxy または Media Processor）
 * 3. レスポンスをキャッシュして返却
 *
 * @param c - Hono コンテキスト
 * @returns レスポンス
 */
export async function handleMedia(c: Context<HonoEnv>): Promise<Response> {
  const key = c.req.path.replace(/^\/images\//, "");

  // キーのバリデーション
  try {
    validateKey(key);
  } catch (error) {
    if (error instanceof ValidationError) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({ error: "キーの検証に失敗しました" }, 500);
  }

  const query = c.req.query();
  const download = query.download === "true";
  const mediaType = inferMediaType(key);

  const cacheKey = buildCacheKey(c.req.url, download);

  // 1. キャッシュチェック
  const cachedResponse = await getCachedMedia(cacheKey);
  if (cachedResponse) {
    return cachedResponse;
  }

  // 2. オリジンフェッチ
  const result = await fetchMediaFromOrigin(
    c,
    key,
    query,
    download,
    mediaType,
    cacheKey.url,
  );

  // バリデーションエラー or フェッチエラー
  if (!(result instanceof Response)) {
    return c.json({ error: result.error }, result.status);
  }

  // 3. レスポンスをキャッシュして返却
  return cacheAndReturnMedia(c, result, key, download, cacheKey);
}
