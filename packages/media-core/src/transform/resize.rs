use crate::constants::MAX_PIXELS;
use crate::errors::TransformError;
use fast_image_resize::{images::Image, FilterType, PixelType, ResizeOptions, Resizer};
use image::DynamicImage;

/// 画像をリサイズする
///
/// fast_image_resize を使用して高品質なリサイズを行う
/// Lanczos3 フィルタを使用
pub fn resize_image(
    img: &DynamicImage,
    target_w: u32,
    target_h: u32,
) -> Result<DynamicImage, TransformError> {
    // ピクセル数チェック
    let total_pixels = target_w as u64 * target_h as u64;
    if total_pixels > MAX_PIXELS {
        return Err(TransformError::ResolutionTooLarge {
            width: target_w,
            height: target_h,
        });
    }

    // RGB8 に変換
    let rgb_img = img.to_rgb8();
    let width = rgb_img.width();
    let height = rgb_img.height();

    // fast_image_resize の Image を作成
    let src_image = Image::from_vec_u8(
        width,
        height,
        rgb_img.into_raw(),
        PixelType::U8x3,
    )
    .map_err(|e| TransformError::ProcessingFailed(format!("failed to create source image: {e}")))?;

    // リサイズ先の Image を作成
    let mut dst_image = Image::new(target_w, target_h, PixelType::U8x3);

    // Resizer を作成してリサイズ実行（Lanczos3 フィルタ）
    let mut resizer = Resizer::new();
    resizer
        .resize(
            &src_image,
            &mut dst_image,
            &ResizeOptions::new().resize_alg(fast_image_resize::ResizeAlg::Convolution(
                FilterType::Lanczos3,
            )),
        )
        .map_err(|e| TransformError::ProcessingFailed(format!("resize failed: {e}")))?;

    // DynamicImage に変換
    let resized_rgb = image::RgbImage::from_raw(target_w, target_h, dst_image.into_vec())
        .ok_or_else(|| {
            TransformError::ProcessingFailed("failed to convert resized image".to_string())
        })?;

    Ok(DynamicImage::ImageRgb8(resized_rgb))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resize_image() {
        let img = DynamicImage::new_rgb8(1000, 1000);
        let result = resize_image(&img, 500, 500);

        assert!(result.is_ok());
        let resized = result.unwrap();
        assert_eq!(resized.width(), 500);
        assert_eq!(resized.height(), 500);
    }

    #[test]
    fn test_resize_exceeds_max_pixels() {
        let img = DynamicImage::new_rgb8(100, 100);
        let result = resize_image(&img, 100000, 100000);

        assert!(result.is_err());
        match result.unwrap_err() {
            TransformError::ResolutionTooLarge { width, height } => {
                assert_eq!(width, 100000);
                assert_eq!(height, 100000);
            }
            _ => panic!("expected ResolutionTooLarge error"),
        }
    }
}
