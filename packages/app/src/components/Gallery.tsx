"use client";

import { ArrowDown, ArrowUp, ChevronDown, Loader2, Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type MediaType = "image" | "video";

type MediaItem = {
  key: string; // 配信用パス
  size: number; // バイト数
  lastModified: string; // ISO文字列
};

type MediasResponse = {
  medias: MediaItem[]; // 一覧
  nextPage: number | null; // 次ページ番号
  isTruncated: boolean; // まだ続きがあるか
  keyCount: number; // 現在のページのアイテム数
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function Gallery() {
  const observerTargetRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState<2 | 3 | 4 | 5 | 6>(4);
  const [isColsOpen, setIsColsOpen] = useState(false);
  const [showScrollButtons, setShowScrollButtons] = useState(false);

  const { data: totalCount } = useSWR<{ count: number }>(
    "/api/medias/count",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  // SWR Infinite for pagination
  const getKey = (
    pageIndex: number,
    previousPageData: MediasResponse | null,
  ) => {
    if (previousPageData && !previousPageData.isTruncated) return null;

    const params = new URLSearchParams({
      maxKeys: "500",
      page: pageIndex.toString(),
    });

    return `/api/medias?${params.toString()}`;
  };

  const { data, error, size, setSize } = useSWRInfinite<MediasResponse>(
    getKey,
    fetcher,
    {
      revalidateAll: false,
      revalidateFirstPage: false,
    },
  );

  const medias = data ? data.flatMap((page) => page.medias ?? []) : [];
  const isLoadingInitialData = !data && !error;
  const isLoadingMore =
    isLoadingInitialData ||
    (size > 0 && data && typeof data[size - 1] === "undefined");
  const isEmpty = data?.[0]?.medias?.length === 0;
  const isReachingEnd =
    isEmpty || (data && !data[data.length - 1]?.isTruncated);

  const inferType = (item: MediaItem): MediaType => {
    const key = item.key.toLowerCase();
    if (/\.(avif|webp|jpe?g|png|gif|bmp|tiff|svg)$/.test(key)) return "image";
    if (/\.(mp4|webm|mov|m4v|ogg|ogv)$/.test(key)) return "video";
    return "image";
  };

  // Infinite scroll
  useEffect(() => {
    const element = observerTargetRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isLoadingMore && !isReachingEnd) {
          void setSize(size + 1);
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [isLoadingMore, isReachingEnd, setSize, size]);

  // スクロール位置を監視してボタンの表示/非表示を制御
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollButtons(window.scrollY > 200);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  const scrollToTop = () => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const gridColsClass = {
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
    5: "grid-cols-5",
    6: "grid-cols-6",
  }[columns];

  return (
    <>
      {/* トップアンカー */}
      <div ref={topRef} />
      <div className="grid justify-between gap-y-4 py-4">
        {/* 列数切替 */}
        <Popover onOpenChange={setIsColsOpen} open={isColsOpen}>
          <PopoverTrigger asChild>
            <Button className="w-fit" size="sm" variant="outline">
              {columns}列
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-32 p-2">
            <div className="grid gap-2">
              {([2, 3, 4, 5, 6] as const).map((col) => (
                <Button
                  className="w-full justify-center"
                  key={col}
                  onClick={() => {
                    setColumns(col);
                    setIsColsOpen(false);
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

        {/* カウンター */}
        <div className="text-gray-600 text-sm">
          {totalCount?.count && (
            <>
              全{totalCount.count}件中 {medias.length}件表示
              {isReachingEnd && " (全て読み込み済み)"}
            </>
          )}
        </div>
      </div>

      {/* ギャラリー */}
      <div className={`grid ${gridColsClass} gap-2`}>
        {medias.map((item, index) => {
          const type = inferType(item);
          const mediaUrl = `${process.env.NEXT_PUBLIC_CDN_ORIGIN}/${item.key}`;

          return (
            <div className="group relative" key={item.key}>
              <Link
                className="media-tile relative block aspect-square overflow-hidden rounded-md bg-gray-100"
                href={type === "video" ? `/watch/${item.key}` : mediaUrl}
              >
                {type === "image" ? (
                  <Image
                    alt={`${index + 1}`}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    height={504}
                    loading="lazy"
                    src={mediaUrl}
                    unoptimized
                    width={504}
                  />
                ) : (
                  <div className="relative h-full w-full">
                    <video
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      height={504}
                      muted
                      playsInline
                      preload="metadata"
                      src={mediaUrl}
                      width={504}
                    />
                    <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 hover:bg-black/10">
                      <Play className="h-10 w-10 text-white drop-shadow" />
                    </div>
                  </div>
                )}
              </Link>
            </div>
          );
        })}
      </div>

      {/* Loading状態と無限スクロールトリガー */}
      {(isLoadingInitialData || !isReachingEnd) && (
        <div className="mt-8 flex justify-center py-4" ref={observerTargetRef}>
          {(isLoadingInitialData || isLoadingMore) && (
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          )}
        </div>
      )}

      {/* 全て読み込み済み */}
      {isReachingEnd && medias.length > 0 && (
        <div className="mt-8 text-center text-gray-500">
          すべてのメディアを表示しました
        </div>
      )}

      {/* エラー表示 */}
      {error && (
        <div className="mt-8 text-center text-red-500">
          エラーが発生しました。ページを更新してください。
        </div>
      )}

      {/* スクロール用のアンカー */}
      <div ref={bottomRef} />

      {/* 固定位置のスクロールボタン */}
      {medias.length > 0 && showScrollButtons && (
        <>
          {/* トップへスクロール */}
          <Button
            className="fixed right-6 bottom-20 z-50 rounded-full shadow-lg"
            onClick={scrollToTop}
            size="icon"
            variant="outline"
          >
            <ArrowUp className="h-5 w-5" />
          </Button>

          {/* ボトムへスクロール */}
          <Button
            className="fixed right-6 bottom-6 z-50 rounded-full shadow-lg"
            onClick={scrollToBottom}
            size="icon"
            variant="outline"
          >
            <ArrowDown className="h-5 w-5" />
          </Button>
        </>
      )}
    </>
  );
}
