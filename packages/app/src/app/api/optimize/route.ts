import { createHash } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const url = searchParams.get("url");
  const width = searchParams.get("width");
  const height = searchParams.get("height");
  const quality = searchParams.get("quality");
  const format = searchParams.get("format");

  if (!url) {
    return NextResponse.json(
      { error: "URL parameter is required" },
      { status: 400 },
    );
  }

  const referer = request.headers.get("Referer");
  try {
    const response = await fetch(
      url,
      referer
        ? {
            headers: {
              Referer: referer,
            },
          }
        : undefined,
    );
    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch image" },
        { status: 404 },
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const etag = generateETag(url, width, height, quality, format);
    const ifNoneMatch = request.headers.get("If-None-Match");

    if (ifNoneMatch === etag) {
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

    // sharpで画像を処理
    let image = sharp(buffer);

    // サイズ変更
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

    let contentType: string;
    let outputBuffer: Buffer;

    switch (outputFormat) {
      case "jpeg":
      case "jpg":
        contentType = "image/jpeg";
        outputBuffer = await image.jpeg({ quality: q }).toBuffer();
        break;
      case "png":
        contentType = "image/png";
        outputBuffer = await image.png({ quality: q }).toBuffer();
        break;
      case "avif":
        contentType = "image/avif";
        outputBuffer = await image.avif({ quality: q }).toBuffer();
        break;
      default:
        contentType = "image/webp";
        outputBuffer = await image.webp({ quality: q }).toBuffer();
        break;
    }

    // キャッシュヘッダーを設定
    const headers = new Headers();
    headers.set("Content-Type", contentType);
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
): string {
  const params = [
    url,
    width ?? "",
    height ?? "",
    quality ?? "75",
    format ?? "webp",
  ].join("|");
  const hash = createHash("md5").update(params).digest("hex");
  return `"${hash}"`;
}
