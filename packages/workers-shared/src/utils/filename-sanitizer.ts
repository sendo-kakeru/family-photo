/**
 * ファイル名をサニタイズする（RFC 5987準拠）
 * Content-Dispositionヘッダーで安全に使用できる形式にする
 *
 * @param key - オブジェクトキー
 * @returns サニタイズされたファイル名（URLエンコード済み）
 */
export function sanitizeFilename(key: string): string {
  // パスからファイル名部分のみを抽出
  const filename = key.split("/").pop() || key;

  // 許可された文字以外をアンダースコアに置換
  const sanitized = filename.replace(/[^\w\-.]/g, "_");

  // RFC 5987形式でエンコード
  return encodeURIComponent(sanitized);
}

/**
 * Content-Disposition ヘッダー値を生成する
 *
 * @param key - オブジェクトキー
 * @param inline - インライン表示かダウンロードか
 * @returns Content-Dispositionヘッダー値
 */
export function createContentDisposition(key: string, inline = false): string {
  const sanitized = sanitizeFilename(key);
  const disposition = inline ? "inline" : "attachment";

  // RFC 5987形式: filename*=UTF-8''encoded-filename
  return `${disposition}; filename*=UTF-8''${sanitized}`;
}
