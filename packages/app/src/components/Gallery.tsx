"use client";

import type { MediasResponse } from "@repo/shared-types";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Loader2,
  Play,
  Trash2,
} from "lucide-react";
import { parseAsInteger, useQueryState } from "nuqs";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWRInfinite from "swr/infinite";
import MediaModal from "@/components/MediaModal";
import OptimizedImage from "@/components/OptimizedImage";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useGalleryModal } from "@/features/gallery/hooks/useGalleryModal";
import { useGallerySelection } from "@/features/gallery/hooks/useGallerySelection";
import { useScrollButtons } from "@/features/gallery/hooks/useScrollButtons";

type MediaType = "image" | "video";

type MediaItem = {
  key: string;
  size: number;
  lastModified: string;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const inferType = (item: MediaItem): MediaType => {
  const key = item.key.toLowerCase();
  if (/\.(avif|webp|jpe?g|png|gif|bmp|tiff|svg)$/.test(key)) return "image";
  if (/\.(mp4|webm|mov|m4v|ogg|ogv)$/.test(key)) return "video";
  return "image";
};

export default function Gallery() {
  const observerTargetRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useQueryState(
    "columns",
    parseAsInteger.withDefault(4),
  );
  const [isColsOpen, setIsColsOpen] = useState(false);

  // データフェッチ
  const getKey = (
    pageIndex: number,
    previousPageData: MediasResponse | null,
  ) => {
    if (previousPageData && !previousPageData.isTruncated) return null;
    return `/api/medias?maxKeys=500&page=${pageIndex}`;
  };

  const {
    data,
    error,
    size,
    setSize,
    mutate: mediasMutate,
  } = useSWRInfinite<MediasResponse>(getKey, fetcher, {
    revalidateAll: false,
    revalidateFirstPage: false,
  });

  const medias = useMemo(
    () => (data ? data.flatMap((page) => page.medias ?? []) : []),
    [data],
  );
  const totalCount = data?.[0]?.totalCount ?? 0;
  const isLoadingInitialData = !data && !error;
  const isLoadingMore =
    isLoadingInitialData ||
    (size > 0 && data && typeof data[size - 1] === "undefined");
  const isEmpty = data?.[0]?.medias?.length === 0;
  const isReachingEnd =
    isEmpty || (data && !data[data.length - 1]?.isTruncated);

  // カスタムフック
  const {
    modalOpen,
    currentMediaIndex,
    openModal,
    requestCloseModal,
    navigateModal,
  } = useGalleryModal();

  const {
    isSelectionMode,
    selectedKeys,
    isDeleting,
    showDeleteConfirm,
    toggleSelectionMode,
    toggleSelection,
    toggleSelectAll,
    handleDelete,
    setShowDeleteConfirm,
  } = useGallerySelection({ medias, mediasMutate });

  const { showScrollButtons, bottomRef, topRef, scrollToBottom, scrollToTop } =
    useScrollButtons();

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

  const gridColsMap: Record<number, string> = {
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
    5: "grid-cols-5",
    6: "grid-cols-6",
  };
  const gridColsClass = gridColsMap[columns] ?? "grid-cols-4";

  return (
    <>
      <div ref={topRef} />
      <div className="grid justify-between gap-y-4 py-4">
        {/* ツールバー */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <Popover onOpenChange={setIsColsOpen} open={isColsOpen}>
              <PopoverTrigger asChild>
                <Button className="w-fit" size="sm" variant="outline">
                  {columns}列
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-32 p-2">
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

            <Button
              onClick={toggleSelectionMode}
              size="sm"
              variant={isSelectionMode ? "default" : "outline"}
            >
              {isSelectionMode ? "選択モード解除" : "選択"}
            </Button>
          </div>

          {isSelectionMode && (
            <div className="flex gap-2">
              <Button onClick={toggleSelectAll} size="sm" variant="outline">
                {selectedKeys.size === medias.length ? "全解除" : "全選択"}
              </Button>
              <Button
                disabled={selectedKeys.size === 0}
                onClick={() => setShowDeleteConfirm(true)}
                size="sm"
                variant="destructive"
              >
                <Trash2 className="mr-1 h-4 w-4" />
                削除 ({selectedKeys.size})
              </Button>
            </div>
          )}
        </div>

        {/* カウンター */}
        <div className="text-gray-600 text-sm">
          {totalCount > 0 && (
            <>
              全{totalCount}件中 {medias.length}件表示
              {isReachingEnd && " (全て読み込み済み)"}
            </>
          )}
        </div>
      </div>

      {/* ギャラリー */}
      <div className={`grid ${gridColsClass} gap-2`}>
        {medias.map((item, index) => {
          const type = inferType(item);
          const isSelected = selectedKeys.has(item.key);

          return (
            <div className="group relative" key={item.key}>
              <button
                className="media-tile relative block aspect-square w-full overflow-hidden rounded-md bg-gray-100"
                onClick={() => {
                  if (isSelectionMode) {
                    toggleSelection(item.key);
                  } else {
                    openModal(index);
                  }
                }}
                type="button"
              >
                {type === "image" ? (
                  <OptimizedImage
                    alt={`${index + 1}`}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    format="webp"
                    height={400}
                    loading="lazy"
                    quality={75}
                    src={item.key}
                    width={400}
                  />
                ) : (
                  <div className="relative h-full w-full">
                    <video
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      height={400}
                      muted
                      playsInline
                      preload="metadata"
                      src={`${process.env.NEXT_PUBLIC_CDN_ORIGIN}/images/${item.key}`}
                      width={400}
                    />
                    <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 hover:bg-black/10">
                      <Play className="h-10 w-10 text-white drop-shadow" />
                    </div>
                  </div>
                )}
                {isSelectionMode && (
                  <div
                    className={`absolute top-2 right-2 h-6 w-6 rounded-full border-2 ${
                      isSelected
                        ? "border-blue-500 bg-blue-500"
                        : "border-white bg-black/20"
                    } flex items-center justify-center`}
                  >
                    {isSelected && <Check className="h-4 w-4 text-white" />}
                  </div>
                )}
              </button>
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

      {isReachingEnd && medias.length > 0 && (
        <div className="mt-8 text-center text-gray-500">
          すべてのメディアを表示しました
        </div>
      )}

      {error && (
        <div className="mt-8 text-center text-red-500">
          エラーが発生しました。ページを更新してください。
        </div>
      )}

      <div ref={bottomRef} />

      {/* 固定位置のスクロールボタン */}
      {medias.length > 0 && showScrollButtons && (
        <>
          <Button
            className="fixed right-6 bottom-20 z-50 rounded-full shadow-lg"
            onClick={scrollToTop}
            size="icon"
            variant="outline"
          >
            <ArrowUp className="h-5 w-5" />
          </Button>
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

      <MediaModal
        allMedia={medias}
        currentIndex={currentMediaIndex}
        currentMedia={medias[currentMediaIndex] || null}
        isOpen={modalOpen}
        onClose={requestCloseModal}
        onNavigate={navigateModal}
      />

      {/* 削除確認ダイアログ */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 font-bold text-lg">削除の確認</h2>
            <p className="mb-6 text-gray-600">
              選択した{selectedKeys.size}件のメディアを削除しますか？
              <br />
              この操作は元に戻せません。
            </p>
            <div className="flex justify-end gap-3">
              <Button
                disabled={isDeleting}
                onClick={() => setShowDeleteConfirm(false)}
                variant="outline"
              >
                キャンセル
              </Button>
              <Button
                disabled={isDeleting}
                onClick={handleDelete}
                variant="destructive"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    削除中...
                  </>
                ) : (
                  "削除"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
