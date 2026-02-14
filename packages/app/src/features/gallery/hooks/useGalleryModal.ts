import { useEffect, useRef, useState } from "react";

export function useGalleryModal() {
  const [modalOpen, setModalOpen] = useState(false);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const modalHistoryPushedRef = useRef(false);

  // モーダルを開く: まず履歴にモーダル専用 state を積んでから開く
  const openModal = (index: number) => {
    setCurrentMediaIndex(index);
    // 既に積んでいる場合は二重に積まない
    if (!modalHistoryPushedRef.current) {
      window.history.pushState({ galleryModal: true, mediaIndex: index }, "");
      modalHistoryPushedRef.current = true;
    }
    setModalOpen(true);
  };

  // ボタン等から閉じる: pushState した分だけ戻る(=popstateで閉じる)
  const requestCloseModal = () => {
    if (modalHistoryPushedRef.current) {
      window.history.back();
      return;
    }
    setModalOpen(false);
  };

  // モーダル内のナビゲーション
  const navigateModal = (index: number) => {
    setCurrentMediaIndex(index);
  };

  // popstate (ブラウザバック) 時にモーダルを閉じる
  useEffect(() => {
    const handlePopState = () => {
      // モーダル履歴を抜けた (戻る) とき
      if (
        modalHistoryPushedRef.current &&
        !window.history.state?.galleryModal
      ) {
        modalHistoryPushedRef.current = false;
        setModalOpen(false);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  return {
    currentMediaIndex,
    modalOpen,
    navigateModal,
    openModal,
    requestCloseModal,
  };
}
