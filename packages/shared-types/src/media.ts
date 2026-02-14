/**
 * メディアタイプ
 */
export type MediaType = "image" | "video" | "other";

/**
 * メディアアイテム
 * S3オブジェクトのメタデータを表現
 */
export type MediaItem = {
  /** オブジェクトキー */
  key: string;
  /** ファイルサイズ（バイト） */
  size: number;
  /** 最終更新日時（ISO 8601形式） */
  lastModified: string;
};
