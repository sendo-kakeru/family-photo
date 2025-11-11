export type MediaType = "image" | "video";

export type MediaItem = {
  key: string;
  size: number;
  lastModified: string;
};

const IMAGE_EXTENSION_PATTERN = /\.(avif|webp|jpe?g|png|gif|bmp|tiff|svg)$/i;
const VIDEO_EXTENSION_PATTERN = /\.(mp4|webm|mov|m4v|ogg|ogv)$/i;

const cdnUrlFor = (key: string) =>
  `${process.env.NEXT_PUBLIC_CDN_ORIGIN}/${key}`;

export function inferMediaType(
  media: Pick<MediaItem, "key"> | string,
): MediaType {
  const key = typeof media === "string" ? media : media.key;
  if (IMAGE_EXTENSION_PATTERN.test(key)) {
    return "image";
  }
  if (VIDEO_EXTENSION_PATTERN.test(key)) {
    return "video";
  }
  return "image";
}

export function buildMediaUrl(
  media: Pick<MediaItem, "key"> | string,
  type: MediaType = inferMediaType(media),
): string {
  const key = typeof media === "string" ? media : media.key;
  if (type === "image") {
    return cdnUrlFor(key);
  }

  return `/api/optimize?url=${encodeURIComponent(cdnUrlFor(key))}&original=true`;
}
