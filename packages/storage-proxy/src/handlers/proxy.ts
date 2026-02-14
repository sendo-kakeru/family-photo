import type { Context } from "hono";
import { createB2Client, signRequest } from "../services/b2-client";
import type { HonoEnv } from "../types";

/**
 * HTTPS プロトコルとポート
 */
const HTTPS_PROTOCOL = "https:";
const HTTPS_PORT = "443";

/**
 * Range リクエストのリトライ回数
 */
const RANGE_RETRY_ATTEMPTS = 3;

/**
 * 署名に含めないヘッダー
 */
const UNSIGNABLE_HEADERS = [
  "x-forwarded-proto",
  "x-real-ip",
  "accept-encoding",
];

/**
 * HEAD レスポンスを作成する
 *
 * @param response - 元のレスポンス
 * @returns HEAD レスポンス（ボディなし）
 */
function createHeadResponse(response: Response): Response {
  return new Response(null, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}

/**
 * リストバケットリクエストか判定する
 *
 * @param bucketName - バケット名
 * @param path - リクエストパス
 * @returns リストバケットリクエストの場合 true
 */
function isListBucketRequest(bucketName: string, path: string): boolean {
  const pathSegments = path.split("/");
  return (
    (bucketName === "$path" && pathSegments.length < 2) ||
    (bucketName !== "$path" && path.length === 0)
  );
}

/**
 * リクエストヘッダーをフィルタリングする
 *
 * 署名に含めないヘッダーと、環境変数で指定されたヘッダーのみを通す
 *
 * @param headers - 元のヘッダー
 * @param allowedHeaders - 許可されたヘッダー（環境変数）
 * @returns フィルタリング後のヘッダー
 */
function filterProxyHeaders(
  headers: Headers,
  allowedHeaders?: string[],
): Headers {
  const filteredHeaders: [string, string][] = [];

  for (const [key, value] of headers) {
    const shouldFilter =
      UNSIGNABLE_HEADERS.includes(key) ||
      key.startsWith("cf-") ||
      (allowedHeaders && !allowedHeaders.includes(key));

    if (!shouldFilter) {
      filteredHeaders.push([key, value]);
    }
  }

  return new Headers(filteredHeaders);
}

/**
 * B2 プロキシ URL を構築する
 *
 * バケット名の設定（$path, $host, 固定値）に応じて URL を構築
 *
 * @param c - Hono コンテキスト
 * @returns プロキシ URL とパス
 */
function buildProxyUrl(c: Context<HonoEnv>): {
  url: URL;
  path: string;
} {
  const env = c.env;
  const requestUrl = new URL(c.req.url);

  requestUrl.protocol = HTTPS_PROTOCOL;
  requestUrl.port = HTTPS_PORT;

  let path = requestUrl.pathname.substring(1); // 先頭の "/" を削除
  path = path.replace(/\/$/, ""); // 末尾の "/" を削除

  // BUCKET_NAME の設定に応じてホスト名を変更
  switch (env.BUCKET_NAME) {
    case "$path":
      requestUrl.hostname = env.B2_ENDPOINT;
      break;
    case "$host":
      requestUrl.hostname = `${requestUrl.hostname.split(".")[0]}.${env.B2_ENDPOINT}`;
      break;
    default:
      requestUrl.hostname = `${env.BUCKET_NAME}.${env.B2_ENDPOINT}`;
      break;
  }

  // RCLONE_DOWNLOAD が有効な場合はパスを調整
  const rcloneDownload = String(env.RCLONE_DOWNLOAD) === "true";
  if (rcloneDownload) {
    if (env.BUCKET_NAME === "$path") {
      requestUrl.pathname = path.replace(/^file\//, "");
    } else {
      requestUrl.pathname = path.replace(/^file\/[^/]+\//, "");
    }
  }

  return { path, url: requestUrl };
}

/**
 * Range ヘッダー付きリクエストをリトライ付きでフェッチする
 *
 * B2 が Range リクエストに対して content-range ヘッダーを返さないことがあるため、
 * 最大3回リトライする
 *
 * @param signedRequest - 署名付きリクエスト
 * @returns レスポンス
 */
async function fetchWithRangeRetry(signedRequest: Request): Promise<Response> {
  let attempts = RANGE_RETRY_ATTEMPTS;
  let response: Response;

  do {
    const controller = new AbortController();
    response = await fetch(signedRequest.url, {
      headers: signedRequest.headers,
      method: signedRequest.method,
      signal: controller.signal,
    });

    if (response.headers.has("content-range")) {
      if (attempts < RANGE_RETRY_ATTEMPTS) {
        console.log(
          `${signedRequest.url} のリトライに成功しました（content-rangeヘッダーあり）`,
        );
      }
      break;
    }

    if (response.ok) {
      attempts -= 1;
      console.error(
        `${signedRequest.url} のリクエストにRangeヘッダーがありますがレスポンスにcontent-rangeがありません。残り${attempts}回リトライします`,
      );
      if (attempts > 0) {
        controller.abort();
      }
    } else {
      break;
    }
  } while (attempts > 0);

  if (attempts <= 0) {
    console.error(
      `${signedRequest.url} のRangeリクエストを${RANGE_RETRY_ATTEMPTS}回試行しましたが、レスポンスにcontent-rangeがありませんでした`,
    );
  }

  return response;
}

/**
 * プロキシハンドラ
 *
 * B2 ストレージへのリクエストをプロキシする
 * AWS Signature V4 で署名し、Range リクエストはリトライ付きでフェッチ
 *
 * @param c - Hono コンテキスト
 * @param method - HTTP メソッド（GET または HEAD）
 * @returns レスポンス
 */
export async function handleProxy(
  c: Context<HonoEnv>,
  method: "GET" | "HEAD",
): Promise<Response> {
  const env = c.env;

  try {
    // 1. プロキシ URL を構築
    const { url: requestUrl, path } = buildProxyUrl(c);

    // 2. リストバケットリクエストは拒否（設定による）
    if (
      isListBucketRequest(env.BUCKET_NAME, path) &&
      String(env.ALLOW_LIST_BUCKET) !== "true"
    ) {
      return c.notFound();
    }

    // 3. ヘッダーをフィルタリング
    const headers = filterProxyHeaders(c.req.raw.headers, env.ALLOWED_HEADERS);

    // 4. AWS Signature V4 で署名
    const client = createB2Client(env);
    const signedRequest = await signRequest(
      client,
      requestUrl.toString(),
      headers,
    );

    // 5. Range ヘッダーがある場合はリトライ付きフェッチ
    if (signedRequest.headers.has("range")) {
      const response = await fetchWithRangeRetry(signedRequest);

      if (method === "HEAD") {
        return createHeadResponse(response);
      }

      return response;
    }

    // 6. 通常のフェッチ
    const fetchPromise = fetch(signedRequest);

    if (method === "HEAD") {
      const response = await fetchPromise;
      return createHeadResponse(response);
    }

    return fetchPromise;
  } catch (error) {
    console.error("handleProxyでエラーが発生しました:", error);
    return c.text("Internal Server Error", 500);
  }
}
