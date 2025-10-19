"use client";

import { ChevronDown, Loader2, Play } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

type MediaType = "image" | "video";

type MediaItem = {
  url: string; // 配信用URL（署名付き /assets/... を想定）
  size: number; // バイト数
  lastModified: string; // ISO文字列
  contentType?: string; // 可能なら API で返す（例: "image/jpeg", "video/mp4"）
  // 必要なら key なども追加
};

type MediasResponse = {
  medias: MediaItem[]; // 一覧
  nextContinuationToken: string | null; // 次ページトークン
  isTruncated: boolean; // まだ続きがあるか
};

export default function Gallery() {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [continuationToken, setContinuationToken] = useState<string | null>(
    null,
  );
  const [isColsOpen, setIsColsOpen] = useState(false);
  const [columns, setColumns] = useState<2 | 4 | 6 | 8>(4);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [jumpToIndex, setJumpToIndex] = useState("");
  const observerTargetRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/medias/count")
      .then((res) => res.json())
      .then((data) => setTotalCount(data.count))
      .catch(console.error);
  }, []);

  const inferType = (item: MediaItem): MediaType => {
    const contentType = item.contentType?.toLowerCase() ?? "";
    if (contentType.startsWith("image/")) return "image";
    if (contentType.startsWith("video/")) return "video";

    // contentType が無い場合は拡張子で判定
    const url = item.url.toLowerCase();
    if (/\.(avif|webp|jpe?g|png|gif|bmp|tiff|svg)$/.test(url)) return "image";
    if (/\.(mp4|webm|mov|m4v|ogg|ogv)$/.test(url)) return "video";
    // 既定は画像扱い（必要に応じて変更）
    return "image";
  };

  const loadNextPage = useCallback(async () => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);
    try {
      const searchParams = new URLSearchParams({ maxKeys: "50" });
      if (continuationToken)
        searchParams.append("continuationToken", continuationToken);

      const res = await fetch(`/api/medias?${searchParams.toString()}`);
      if (!res.ok) throw new Error(`list failed: ${res.status}`);
      const data: MediasResponse = await res.json();

      setMediaItems((prev) => [...prev, ...(data.medias ?? [])]);
      setContinuationToken(data.nextContinuationToken);
      setHasMore(Boolean(data.isTruncated));
    } catch (error) {
      console.error("Error loading medias:", error);
    } finally {
      setIsLoading(false);
    }
  }, [continuationToken, hasMore, isLoading]);

  // 無限スクロール
  useEffect(() => {
    const element = observerTargetRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadNextPage();
      },
      { threshold: 0.1 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [loadNextPage]);

  // 指定インデックスへジャンプ
  const handleJump = async () => {
    const index = Number.parseInt(jumpToIndex, 10);
    if (Number.isNaN(index) || index < 1 || (totalCount && index > totalCount))
      return;

    const targetIdx = index - 1;
    const preloadCount = targetIdx + columns * 2; // 余裕を持って読み込み

    if (mediaItems.length < preloadCount && hasMore) {
      setIsLoading(true);
      let token = continuationToken;
      let list = [...mediaItems];
      let more: boolean = hasMore;

      while (list.length < preloadCount && more) {
        const params = new URLSearchParams({ maxKeys: "50" });
        if (token) params.append("continuationToken", token);

        try {
          const response = await fetch(`/api/medias?${params}`);
          if (!response.ok) break;
          const data: MediasResponse = await response.json();
          list = [...list, ...(data.medias ?? [])];
          token = data.nextContinuationToken;
          more = Boolean(data.isTruncated);
        } catch (error) {
          console.error(error);
          break;
        }
      }

      setMediaItems(list);
      setContinuationToken(token);
      setHasMore(more);
      setIsLoading(false);
    }

    // スクロール
    // setTimeout(() => {
    //   const tiles = gridRef.current?.querySelectorAll(".media-tile");
    //   const node = tiles?.[targetIdx];
    //   node?.scrollIntoView({ behavior: "smooth", block: "center" });
    // }, 100);
  };

  const gridColsClass =
    columns === 2
      ? "grid-cols-2"
      : columns === 4
        ? "grid-cols-4"
        : columns === 6
          ? "grid-cols-6"
          : "grid-cols-8";

  return (
    <div>
      <div className="mb-6 grid gap-4 py-4">
        {/* カウンター */}
        {totalCount !== null && (
          <div className="text-gray-600 text-sm">
            全{totalCount}件中 {mediaItems.length}件表示
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          {/* 列数切替 */}
          <Popover onOpenChange={setIsColsOpen} open={isColsOpen}>
            <PopoverTrigger asChild>
              <Button className="w-32" variant="outline">
                {columns}列
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </PopoverTrigger>

            <PopoverContent align="start" className="w-32 p-2">
              <div className="grid gap-2">
                {([2, 4, 6, 8] as const).map((col) => (
                  <Button
                    className="w-full justify-center"
                    key={col}
                    onClick={() => {
                      setColumns(col);
                      setIsColsOpen(false); // 選択後に閉じる
                    }}
                    size="sm"
                    variant={columns === col ? "default" : "outline"}
                  >
                    {col}列
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* ジャンプ */}
          <div className="flex items-center gap-2">
            <Input
              className="w-28"
              max={totalCount ?? undefined}
              min={1}
              onChange={(e) => setJumpToIndex(e.target.value)}
              placeholder="番号"
              type="number"
              value={jumpToIndex}
            />
            <Button disabled={!jumpToIndex} onClick={handleJump}>
              枚目へ
            </Button>
          </div>
        </div>
      </div>

      {/* ギャラリー */}
      <div className={`grid ${gridColsClass} gap-2 md:gap-4`} ref={gridRef}>
        {mediaItems.map((item, idx) => {
          const kind = inferType(item);
          return (
            <div
              className="media-tile relative aspect-square overflow-hidden rounded-md bg-gray-100"
              key={item.url}
            >
              {kind === "image" ? (
                <Image
                  alt={`${idx + 1}`}
                  className="h-full w-full object-cover transition-transform hover:scale-105"
                  height={240}
                  loading="lazy"
                  src={item.url}
                  unoptimized
                  width={240}
                />
              ) : (
                <div className="relative h-full w-full">
                  <video
                    className="h-full w-full object-cover transition-transform hover:scale-105"
                    muted
                    playsInline
                    preload="metadata"
                    src={item.url}
                  />
                  <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 hover:bg-black/10">
                    <Play className="h-10 w-10 text-white drop-shadow" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 無限スクロールトリガ */}
      {hasMore && (
        <div className="mt-8 flex justify-center py-4" ref={observerTargetRef}>
          {isLoading && (
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          )}
        </div>
      )}

      {!hasMore && mediaItems.length > 0 && (
        <div className="mt-8 text-center text-gray-500">
          すべてのメディアを表示しました
        </div>
      )}
    </div>
  );
}
