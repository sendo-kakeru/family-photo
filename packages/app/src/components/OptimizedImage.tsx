"use client";

import { type ComponentProps, useState } from "react";

type OptimizedImageProps = ComponentProps<"img"> & {
  src: string;
  quality?: number;
  format?: "webp" | "jpeg" | "png" | "avif";
  onLoad?: () => void;
  onError?: () => void;
};

export default function OptimizedImage({
  src,
  quality = 75,
  format = "webp",
  onLoad,
  onError,
  ...imgProps
}: OptimizedImageProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // 最適化されたURLを生成
  const getOptimizedUrl = (originalUrl: string) => {
    const params = new URLSearchParams();
    params.set("url", originalUrl);
    if (imgProps.width) params.set("width", imgProps.width.toString());
    if (imgProps.height) params.set("height", imgProps.height.toString());
    params.set("quality", quality.toString());
    params.set("format", format);

    // 画像最適化APIを使用
    return `/api/optimize?${params.toString()}`;
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

  // エラー時は元の画像を表示
  const finalSrc = imageError ? src : optimizedSrc;

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
