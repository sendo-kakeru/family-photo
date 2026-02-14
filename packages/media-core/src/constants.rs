/// 画像の最大寸法（幅・高さ）
pub const MAX_DIMENSION: u32 = 4096;

/// 画像の最大ピクセル数（1GP = 実質無制限、極端な攻撃のみ防止）
pub const MAX_PIXELS: u64 = 1_000_000_000;

/// デフォルト品質（1-100）
pub const DEFAULT_QUALITY: u8 = 80;
