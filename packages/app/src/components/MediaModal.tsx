"use client";

import { ChevronLeft, ChevronRight, Download, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import OptimizedImage from "@/components/OptimizedImage";
import { Button } from "@/components/ui/button";

type MediaType = "image" | "video";

type MediaItem = {
  key: string;
  size: number;
  lastModified: string;
};

type MediaModalProps = {
  isOpen: boolean;
  onClose: () => void;
  currentMedia: MediaItem | null;
  allMedia: MediaItem[];
  currentIndex: number;
  onNavigate: (index: number) => void;
};

export default function MediaModal({
  isOpen,
  onClose,
  currentMedia,
  allMedia,
  currentIndex,
  onNavigate,
}: MediaModalProps) {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [imageLoading, setImageLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const inferType = (item: MediaItem): MediaType => {
    const key = item.key.toLowerCase();
    if (/\.(avif|webp|jpe?g|png|gif|bmp|tiff|svg)$/.test(key)) return "image";
    if (/\.(mp4|webm|mov|m4v|ogg|ogv)$/.test(key)) return "video";
    return "image";
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      onNavigate(currentIndex - 1);
    }
  };

  const goToNext = () => {
    if (currentIndex < allMedia.length - 1) {
      onNavigate(currentIndex + 1);
    }
  };

  const handleDownload = async () => {
    if (!currentMedia || downloading) return;

    setDownloading(true);
    const fileName = currentMedia.key.split("/").pop() || "download";

    try {
      // APIエンドポイント経由でダウンロード
      const response = await fetch(
        `/api/download?path=${encodeURIComponent(currentMedia.key)}`,
      );

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
      alert("ダウンロードに失敗しました。");
    } finally {
      setDownloading(false);
    }
  };

  // スワイプ検出
  const minSwipeDistance = 50;

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      goToNext();
    } else if (isRightSwipe) {
      goToPrevious();
    }
  };

  // Reset loading state when media changes
  useEffect(() => {
    if (currentMedia) {
      setImageLoading(true);
    }
  }, [currentMedia]);

  if (!isOpen || !currentMedia) return null;

  const mediaType = inferType(currentMedia);
  const mediaUrl = `${process.env.NEXT_PUBLIC_CDN_ORIGIN}/${currentMedia.key}`;

  return (
    <div className="fixed inset-0 z-50 bg-black md:bg-black/90">
      {/* ヘッダー */}
      <div className="absolute top-0 right-0 left-0 z-10 bg-linear-to-b from-black/70 to-transparent p-2 pt-safe-top md:p-4">
        <div className="flex items-center justify-end gap-1 md:gap-2">
          <Button
            className="h-8 w-8 text-white hover:bg-white/20 md:h-10 md:w-10"
            disabled={downloading}
            onClick={handleDownload}
            size="icon"
            variant="ghost"
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin md:h-5 md:w-5" />
            ) : (
              <Download className="h-4 w-4 md:h-5 md:w-5" />
            )}
          </Button>
          <Button
            className="h-8 w-8 text-white hover:bg-white/20 md:h-10 md:w-10"
            onClick={onClose}
            size="icon"
            variant="ghost"
          >
            <X className="h-4 w-4 md:h-5 md:w-5" />
          </Button>
        </div>
      </div>

      {/* メディア表示エリア */}
      <div
        className="relative flex h-full items-center justify-center p-1 md:p-4"
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onTouchStart={handleTouchStart}
      >
        {mediaType === "image" ? (
          <>
            <OptimizedImage
              alt={currentMedia.key}
              className="max-h-full max-w-full object-contain"
              format="webp"
              onLoad={() => setImageLoading(false)}
              quality={90}
              src={mediaUrl}
              style={{
                opacity: imageLoading ? 0 : 1,
                transition: "opacity 0.3s ease-in-out",
              }}
            />
            {imageLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
              </div>
            )}
          </>
        ) : (
          <video
            className="max-h-full max-w-full"
            controls
            muted={false}
            playsInline
            preload="metadata"
            src={mediaUrl}
          />
        )}
      </div>

      {/* ナビゲーションボタン */}
      {currentIndex > 0 && (
        <Button
          className="-translate-y-1/2 absolute top-1/2 left-2 h-8 w-8 text-white hover:bg-white/20 md:left-4 md:h-10 md:w-10"
          onClick={goToPrevious}
          size="icon"
          variant="ghost"
        >
          <ChevronLeft className="h-6 w-6 md:h-8 md:w-8" />
        </Button>
      )}

      {currentIndex < allMedia.length - 1 && (
        <Button
          className="-translate-y-1/2 absolute top-1/2 right-2 h-8 w-8 text-white hover:bg-white/20 md:right-4 md:h-10 md:w-10"
          onClick={goToNext}
          size="icon"
          variant="ghost"
        >
          <ChevronRight className="h-6 w-6 md:h-8 md:w-8" />
        </Button>
      )}
    </div>
  );
}
