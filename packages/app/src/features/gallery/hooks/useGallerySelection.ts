import { useState } from "react";

export type MediaItem = {
  key: string;
  size: number;
  lastModified: string;
};

type UseGallerySelectionProps = {
  medias: MediaItem[];
  totalCountMutate: () => Promise<unknown>;
  mediasMutate: () => Promise<unknown>;
};

export function useGallerySelection({
  medias,
  totalCountMutate,
  mediasMutate,
}: UseGallerySelectionProps) {
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // 選択モードを切り替え
  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    if (isSelectionMode) {
      setSelectedKeys(new Set());
    }
  };

  // 画像の選択/選択解除
  const toggleSelection = (key: string) => {
    const newSelected = new Set(selectedKeys);
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedKeys(newSelected);
  };

  // 全選択/全解除
  const toggleSelectAll = () => {
    if (selectedKeys.size === medias.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(medias.map((m) => m.key)));
    }
  };

  // 削除実行
  const handleDelete = async () => {
    if (selectedKeys.size === 0) return;

    setIsDeleting(true);
    try {
      const response = await fetch("/api/medias", {
        body: JSON.stringify({ keys: Array.from(selectedKeys) }),
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("削除に失敗しました");
      }

      // データを再取得
      await Promise.all([totalCountMutate(), mediasMutate()]);

      setSelectedKeys(new Set());
      setIsSelectionMode(false);
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error("削除に失敗しました:", error);
      alert("削除に失敗しました");
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    handleDelete,
    isDeleting,
    isSelectionMode,
    selectedKeys,
    setShowDeleteConfirm,
    showDeleteConfirm,
    toggleSelectAll,
    toggleSelection,
    toggleSelectionMode,
  };
}
