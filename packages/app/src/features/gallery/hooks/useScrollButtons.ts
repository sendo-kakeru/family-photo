import { useEffect, useRef, useState } from "react";

export function useScrollButtons() {
  const [showScrollButtons, setShowScrollButtons] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

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

  return {
    bottomRef,
    scrollToBottom,
    scrollToTop,
    showScrollButtons,
    topRef,
  };
}
