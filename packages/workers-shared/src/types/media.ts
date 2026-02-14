/**
 * メディアタイプ
 */
export type MediaType = "image" | "video" | "other";

/**
 * ファイル拡張子からメディアタイプを推論する
 */
export function inferMediaType(key: string): MediaType {
  const lowerKey = key.toLowerCase();

  if (/\.(avif|webp|jpe?g|png|gif|bmp|tiff|svg)$/.test(lowerKey)) {
    return "image";
  }

  if (/\.(mp4|webm|mov|m4v|ogg|ogv)$/.test(lowerKey)) {
    return "video";
  }

  return "other";
}
