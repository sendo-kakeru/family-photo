/// 縮小倍率を計算する（withoutEnlargement: 拡大しない）
///
/// 両方の寸法が指定されている場合、アスペクト比を維持しつつ
/// 指定された領域に収まる最大の倍率を返す（最大1.0）
fn calculate_scale_factor(
    src_w: u32,
    src_h: u32,
    target_w: u32,
    target_h: u32,
) -> f64 {
    let scale_w = target_w as f64 / src_w as f64;
    let scale_h = target_h as f64 / src_h as f64;

    // 小さい方の倍率を採用し、拡大は防止（最大1.0）
    scale_w.min(scale_h).min(1.0)
}

/// 倍率を適用して新しい寸法を計算する
fn apply_scale(src_w: u32, src_h: u32, scale: f64) -> (u32, u32) {
    let new_w = (src_w as f64 * scale).round() as u32;
    let new_h = (src_h as f64 * scale).round() as u32;

    // 最小1pxを保証
    (new_w.max(1), new_h.max(1))
}

/// 幅のみ指定時の寸法を計算する
fn calculate_width_only(src_w: u32, src_h: u32, target_w: u32) -> (u32, u32) {
    let scale = (target_w as f64 / src_w as f64).min(1.0); // withoutEnlargement
    apply_scale(src_w, src_h, scale)
}

/// 高さのみ指定時の寸法を計算する
fn calculate_height_only(src_w: u32, src_h: u32, target_h: u32) -> (u32, u32) {
    let scale = (target_h as f64 / src_h as f64).min(1.0); // withoutEnlargement
    apply_scale(src_w, src_h, scale)
}

/// Contain モードの寸法を計算する
///
/// アスペクト比を維持しつつ、指定された領域に収まるようにリサイズ
/// withoutEnlargement: 元画像より大きくしない
pub fn calculate_contain_dimensions(
    src_w: u32,
    src_h: u32,
    target_w: Option<u32>,
    target_h: Option<u32>,
) -> (u32, u32) {
    match (target_w, target_h) {
        (Some(w), Some(h)) => {
            let scale = calculate_scale_factor(src_w, src_h, w, h);
            apply_scale(src_w, src_h, scale)
        }
        (Some(w), None) => calculate_width_only(src_w, src_h, w),
        (None, Some(h)) => calculate_height_only(src_w, src_h, h),
        (None, None) => (src_w, src_h),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_scale_factor() {
        // 横長画像を正方形領域に収める
        let scale = calculate_scale_factor(1000, 500, 400, 400);
        assert_eq!(scale, 0.4); // 高さ基準で0.4倍

        // 縦長画像を正方形領域に収める
        let scale = calculate_scale_factor(500, 1000, 400, 400);
        assert_eq!(scale, 0.4); // 幅基準で0.4倍

        // 拡大は防止（withoutEnlargement）
        let scale = calculate_scale_factor(100, 100, 200, 200);
        assert_eq!(scale, 1.0);
    }

    #[test]
    fn test_apply_scale() {
        let (w, h) = apply_scale(1000, 500, 0.4);
        assert_eq!(w, 400);
        assert_eq!(h, 200);

        // 最小1pxを保証
        let (w, h) = apply_scale(10, 10, 0.05);
        assert_eq!(w, 1);
        assert_eq!(h, 1);
    }

    #[test]
    fn test_calculate_width_only() {
        // 幅を400pxに縮小
        let (w, h) = calculate_width_only(1000, 500, 400);
        assert_eq!(w, 400);
        assert_eq!(h, 200);

        // 拡大は防止
        let (w, h) = calculate_width_only(100, 50, 200);
        assert_eq!(w, 100);
        assert_eq!(h, 50);
    }

    #[test]
    fn test_calculate_height_only() {
        // 高さを200pxに縮小
        let (w, h) = calculate_height_only(1000, 500, 200);
        assert_eq!(w, 400);
        assert_eq!(h, 200);

        // 拡大は防止
        let (w, h) = calculate_height_only(100, 50, 100);
        assert_eq!(w, 100);
        assert_eq!(h, 50);
    }

    #[test]
    fn test_calculate_contain_dimensions() {
        // 両方指定
        let (w, h) = calculate_contain_dimensions(1920, 1080, Some(800), Some(600));
        assert_eq!(w, 800);
        assert_eq!(h, 450);

        // 幅のみ
        let (w, h) = calculate_contain_dimensions(1920, 1080, Some(800), None);
        assert_eq!(w, 800);
        assert_eq!(h, 450);

        // 高さのみ
        let (w, h) = calculate_contain_dimensions(1920, 1080, None, Some(600));
        assert_eq!(w, 1067);
        assert_eq!(h, 600);

        // 指定なし
        let (w, h) = calculate_contain_dimensions(1920, 1080, None, None);
        assert_eq!(w, 1920);
        assert_eq!(h, 1080);
    }
}
