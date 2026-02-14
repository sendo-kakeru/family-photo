import { ValidationError } from "../errors/error-types";

/**
 * Range ヘッダーの最大値（10GB）
 */
const MAX_RANGE_VALUE = 10 * 1024 * 1024 * 1024; // 10GB

/**
 * Range ヘッダーを検証する
 * DoS攻撃を防ぐため、異常に大きな値を拒否する
 *
 * @param rangeHeader - Range ヘッダーの値
 * @throws ValidationError - Range ヘッダーが不正な場合
 */
export function validateRangeHeader(rangeHeader: string): void {
  // bytes= で始まることを確認
  if (!rangeHeader.startsWith("bytes=")) {
    throw new ValidationError("Rangeヘッダーは'bytes='で始まる必要があります");
  }

  // bytes= 以降の部分を取得
  const rangeSpec = rangeHeader.slice(6).trim();

  if (!rangeSpec) {
    throw new ValidationError("Rangeヘッダーが空です");
  }

  // 複数のレンジをカンマで分割
  const ranges = rangeSpec.split(",");

  for (const range of ranges) {
    const trimmed = range.trim();

    // レンジの形式: start-end, start-, -end（ハイフン周りの空白を許可）
    const match = trimmed.match(/^(\d+)?\s*-\s*(\d+)?$/);

    if (!match) {
      throw new ValidationError(
        `不正なRangeフォーマット: ${trimmed}（形式: start-end, start-, -end）`,
      );
    }

    const [, start, end] = match;

    // start と end の両方が未指定は不正
    if (!start && !end) {
      throw new ValidationError("Range の start と end の両方が未指定です");
    }

    // 数値が大きすぎないかチェック
    if (start) {
      const startNum = Number.parseInt(start, 10);
      if (startNum > MAX_RANGE_VALUE) {
        throw new ValidationError(
          `Range値が大きすぎます（最大${MAX_RANGE_VALUE}バイト）`,
        );
      }
    }

    if (end) {
      const endNum = Number.parseInt(end, 10);
      if (endNum > MAX_RANGE_VALUE) {
        throw new ValidationError(
          `Range値が大きすぎます（最大${MAX_RANGE_VALUE}バイト）`,
        );
      }
    }
  }
}
