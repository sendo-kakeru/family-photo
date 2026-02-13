"use client";

import { type ComponentProps, useState } from "react";

const MEDIA_ORIGIN = process.env.NEXT_PUBLIC_MEDIA_ORIGIN ?? "";

type OptimizedImageProps = ComponentProps<"img"> & {
  src: string;
  quality?: number;
  format?: "webp" | "jpeg" | "png" | "avif";
  original?: boolean;
  onLoad?: () => void;
  onError?: () => void;
};

export default function OptimizedImage({
  src,
  quality = 75,
  format = "webp",
  onLoad,
  onError,
  original,
  ...imgProps
}: OptimizedImageProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Edge Cache Worker 向け URL を生成
  const getOptimizedUrl = (key: string) => {
    const base = `${MEDIA_ORIGIN}/images/${key}`;
    if (original) return base;

    const params = new URLSearchParams();
    if (imgProps.width) params.set("w", imgProps.width.toString());
    if (imgProps.height) params.set("h", imgProps.height.toString());
    params.set("q", quality.toString());
    params.set("f", format);

    return `${base}?${params.toString()}`;
  };

  const optimizedSrc = getOptimizedUrl(src);

  const handleLoad = () => {
    setImageLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setImageError(true);
    onError?.();
  };

  // エラー時は変換なし URL にフォールバック
  const fallbackSrc = `${MEDIA_ORIGIN}/images/${src}`;
  const finalSrc = imageError ? fallbackSrc : optimizedSrc;

  return (
    // biome-ignore lint/performance/noImgElement: next/imageの代替として独自最適化を実装
    // biome-ignore lint/a11y/useAltText: alt属性はpropsで渡される
    <img
      {...imgProps}
      onError={handleError}
      onLoad={handleLoad}
      src={finalSrc}
      style={{
        opacity: imageLoaded ? 1 : 0,
        transition: "opacity 0.3s ease-in-out",
        ...imgProps.style,
      }}
    />
  );
}
