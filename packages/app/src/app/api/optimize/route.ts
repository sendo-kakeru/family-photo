import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const token =
    cookieStore.get("__Secure-authjs.session-token")?.value ||
    cookieStore.get("authjs.session-token")?.value;
  const searchParams = request.nextUrl.searchParams;
  const url = searchParams.get("url");
  const width = searchParams.get("width");
  const height = searchParams.get("height");
  const quality = searchParams.get("quality");
  const format = searchParams.get("format");
  const original = searchParams.get("original");

  if (!url) {
    return NextResponse.json(
      { error: "URL parameter is required" },
      { status: 400 },
    );
  }

  try {
    // Range リクエストの処理
    const range = request.headers.get("range");
    const isVideoOrOriginal =
      original || url.toLowerCase().match(/\.(mp4|webm|mov|m4v|ogg|ogv)$/);

    const fetchHeaders: Record<string, string> = {};
    if (token) {
      fetchHeaders.Authorization = `Bearer ${token}`;
    }

    // 動画の場合は Range リクエストをそのまま転送
    if (range && isVideoOrOriginal) {
      fetchHeaders.Range = range;
    }

    // ファイル取得
    const response = await fetch(url, { headers: fetchHeaders });

    if (response.status === 403 || response.status === 401) {
      const redirectUrl = new URL("/", request.url);
      redirectUrl.searchParams.set("error", "unauthorized");
      return NextResponse.redirect(redirectUrl);
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch image" },
        { status: 404 },
      );
    }

    const contentType =
      response.headers.get("content-type") ?? "application/octet-stream";

    // ETag をパラメータから生成（既存動作を維持）
    const etag = generateETag(url, width, height, quality, format, original);

    // If-None-Match 処理（304）
    const ifNoneMatch = request.headers.get("If-None-Match");
    if (ifNoneMatch === etag && !range) {
      const notModifiedHeaders = new Headers();
      notModifiedHeaders.set("ETag", etag);
      notModifiedHeaders.set(
        "Cache-Control",
        "public, max-age=31536000, immutable",
      );
      return new NextResponse(null, {
        headers: notModifiedHeaders,
        status: 304,
      });
    }

    // 動画ファイルまたはoriginalが指定されている場合はそのまま返す
    if (original || contentType.startsWith("video/")) {
      const headers = new Headers();
      headers.set("Content-Type", contentType);
      headers.set("ETag", etag);
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
      headers.set("Last-Modified", new Date().toUTCString());
      headers.set("Vary", "Accept-Encoding");

      // 動画ファイルの場合はRange requestsをサポート
      if (contentType.startsWith("video/")) {
        headers.set("Accept-Ranges", "bytes");

        // CDNからの Range レスポンスヘッダーをそのまま転送
        const contentRange = response.headers.get("content-range");
        if (contentRange) {
          headers.set("Content-Range", contentRange);
        }

        const contentLength = response.headers.get("content-length");
        if (contentLength) {
          headers.set("Content-Length", contentLength);
        }

        // Range リクエストの場合は 206 ステータスを返す
        const status = response.status === 206 ? 206 : 200;

        return new NextResponse(response.body, {
          headers,
          status,
        });
      }

      const contentLength = response.headers.get("content-length");
      if (contentLength) {
        headers.set("Content-Length", contentLength);
      }

      return new NextResponse(response.body, { headers });
    }

    // 画像処理のためにバッファを取得
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let image = sharp(buffer);

    // EXIF向きを自動補正
    image = image.rotate();

    // リサイズ
    if (width || height) {
      const w = width ? Number.parseInt(width, 10) : undefined;
      const h = height ? Number.parseInt(height, 10) : undefined;

      image = image.resize(w, h, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    // フォーマット変換
    const outputFormat = format || "webp";
    const q = quality ? Number.parseInt(quality, 10) : 75;

    let outputContentType: string;
    let outputBuffer: Buffer;

    switch (outputFormat) {
      case "jpeg":
      case "jpg":
        outputContentType = "image/jpeg";
        outputBuffer = await image.jpeg({ quality: q }).toBuffer();
        break;
      case "png":
        outputContentType = "image/png";
        outputBuffer = await image.png({ quality: q }).toBuffer();
        break;
      case "avif":
        outputContentType = "image/avif";
        outputBuffer = await image.avif({ quality: q }).toBuffer();
        break;
      default:
        outputContentType = "image/webp";
        outputBuffer = await image.webp({ quality: q }).toBuffer();
        break;
    }

    // キャッシュヘッダ
    const headers = new Headers();
    headers.set("Content-Type", outputContentType);
    headers.set("ETag", etag);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("Content-Length", outputBuffer.length.toString());
    headers.set("Last-Modified", new Date().toUTCString());
    headers.set("Vary", "Accept-Encoding");

    return new NextResponse(new Uint8Array(outputBuffer), { headers });
  } catch (error) {
    console.error("Image optimization error:", error);
    return NextResponse.json(
      { error: "Failed to optimize image" },
      { status: 500 },
    );
  }
}

function generateETag(
  url: string,
  width: string | null,
  height: string | null,
  quality: string | null,
  format: string | null,
  original: string | null,
): string {
  const params = [
    url,
    width ?? "",
    height ?? "",
    quality ?? "75",
    format ?? "webp",
    original ?? "",
  ].join("|");
  const hash = createHash("md5").update(params).digest("hex");
  return `"${hash}"`;
}
