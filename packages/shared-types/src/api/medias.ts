import type { MediaItem } from "../media";

/**
 * /api/medias のレスポンス型
 */
export type MediasResponse = {
  /** メディアアイテム一覧 */
  medias: MediaItem[];
  /** 次のページ番号（最終ページの場合はnull） */
  nextPage: number | null;
  /** さらにアイテムが存在するか */
  isTruncated: boolean;
  /** このページのアイテム数 */
  keyCount: number;
  /** 総メディア数 */
  totalCount: number;
};
