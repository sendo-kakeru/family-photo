import { ValidationError } from "../errors/error-types";

/**
 * オブジェクトキーを検証する
 * パストラバーサル攻撃を防止し、不正な文字を検出する
 *
 * @param key - 検証するオブジェクトキー
 * @throws {ValidationError} キーが無効な場合
 */
export function validateKey(key: string): void {
  // 空文字チェック
  if (!key || key.length === 0) {
    throw new ValidationError("キーが空です");
  }

  // 長さチェック（1024文字まで）
  if (key.length > 1024) {
    throw new ValidationError("キーが長すぎます（最大1024文字）");
  }

  // URLデコード
  let decoded: string;
  try {
    decoded = decodeURIComponent(key);
  } catch {
    throw new ValidationError("無効なURLエンコーディングです");
  }

  // パストラバーサル防止
  if (
    decoded.includes("..") ||
    decoded.startsWith("/") ||
    decoded.includes("//") ||
    decoded.includes("\\")
  ) {
    throw new ValidationError("不正なパスが含まれています");
  }

  // 許可された文字のみ（英数字、ハイフン、アンダースコア、ドット、スラッシュ）
  if (!/^[a-zA-Z0-9/_.-]+$/.test(decoded)) {
    throw new ValidationError("不正な文字が含まれています");
  }
}
