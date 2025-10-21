import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { NextRequest } from "next/server";
import { B2_S3_BUCKET, s3 } from "@/lib/s3";

function joinKey(segments: string[]) {
  // [...key] で受けたパスセグメントを元のキーに戻す
  return segments.map(decodeURIComponent).join("/");
}

function passthroughHeaders(headers: Headers) {
  const keep = new Headers();
  for (const key of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified",
  ]) {
    const value = headers.get(key);
    if (value) keep.set(key, value);
  }
  return keep;
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ key: string[] }> },
) {
  const { key: segs } = await props.params;
  const key = joinKey(segs);

  if (!key) return new Response("Bad Request", { status: 400 });

  const range = request.headers.get("range");

  // S3互換の presigned GET
  const signedUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: B2_S3_BUCKET, Key: key }),
    { expiresIn: 60 * 60 },
  );

  // Range はそのままプロキシ（動画向け）。
  if (range) {
    const upstream = await fetch(signedUrl, { headers: { Range: range } });
    if (!upstream.ok && upstream.status !== 206) {
      return new Response("Not Found", { status: upstream.status });
    }
    const headers = passthroughHeaders(upstream.headers);
    // Range 応答は基本的に CDN へはキャッシュさせない
    headers.set("Cache-Control", "private, max-age=0");
    return new Response(upstream.body, { headers, status: upstream.status });
  }

  // フル応答は Vercel CDN にキャッシュさせる
  const upstream = await fetch(signedUrl);
  if (!upstream.ok)
    return new Response("Not Found", { status: upstream.status });

  const headers = passthroughHeaders(upstream.headers);
  // ブラウザ: max-age、CDN: s-maxage を長めに。キーはUUIDで不変前提なので immutable でOK
  headers.set(
    "Cache-Control",
    "public, max-age=31536000, s-maxage=31536000, immutable",
  );

  return new Response(upstream.body, { headers, status: 200 });
}
