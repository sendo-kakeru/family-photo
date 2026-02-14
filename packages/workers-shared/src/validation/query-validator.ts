import { ValidationError } from "../errors/error-types";

/**
 * 変換パラメータの最大値
 */
const MAX_DIMENSION = 4096;
const MAX_QUALITY = 100;
const MIN_QUALITY = 1;

/**
 * 許可されたフォーマット
 */
const ALLOWED_FORMATS = ["jpeg", "png", "webp", "avif"] as const;

/**
 * クエリパラメータを検証する
 *
 * @param params - URLSearchParams
 * @throws ValidationError - パラメータが不正な場合
 */
export function validateQueryParams(params: URLSearchParams): void {
  // 幅（w）の検証
  const w = params.get("w");
  if (w !== null) {
    const width = Number(w);
    if (Number.isNaN(width) || width <= 0) {
      throw new ValidationError("幅は正の整数である必要があります");
    }
    if (width > MAX_DIMENSION) {
      throw new ValidationError(
        `幅が最大値を超えています（最大${MAX_DIMENSION}px）`,
      );
    }
  }

  // 高さ（h）の検証
  const h = params.get("h");
  if (h !== null) {
    const height = Number(h);
    if (Number.isNaN(height) || height <= 0) {
      throw new ValidationError("高さは正の整数である必要があります");
    }
    if (height > MAX_DIMENSION) {
      throw new ValidationError(
        `高さが最大値を超えています（最大${MAX_DIMENSION}px）`,
      );
    }
  }

  // フォーマット（f）の検証
  const f = params.get("f");
  if (f !== null) {
    if (!ALLOWED_FORMATS.includes(f as (typeof ALLOWED_FORMATS)[number])) {
      throw new ValidationError(
        `不正なフォーマットです（許可: ${ALLOWED_FORMATS.join(", ")}）`,
      );
    }
  }

  // 品質（q）の検証
  const q = params.get("q");
  if (q !== null) {
    const quality = Number(q);
    if (Number.isNaN(quality)) {
      throw new ValidationError("品質は数値である必要があります");
    }
    if (quality < MIN_QUALITY || quality > MAX_QUALITY) {
      throw new ValidationError(
        `品質は${MIN_QUALITY}-${MAX_QUALITY}の範囲で指定してください`,
      );
    }
  }
}
