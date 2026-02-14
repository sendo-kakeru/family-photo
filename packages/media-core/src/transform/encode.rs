use crate::errors::TransformError;
use crate::transform::params::OutputFormat;
use image::codecs::avif::AvifEncoder;
use image::codecs::jpeg::JpegEncoder;
use image::codecs::webp::WebPEncoder;
use image::{DynamicImage, ImageFormat};
use std::io::Cursor;

/// 画像をエンコードする
pub fn encode_image(
    img: &DynamicImage,
    format: OutputFormat,
    quality: u8,
) -> Result<Vec<u8>, TransformError> {
    let mut buf = Cursor::new(Vec::new());

    match format {
        OutputFormat::Jpeg => {
            let encoder = JpegEncoder::new_with_quality(&mut buf, quality);
            img.to_rgb8()
                .write_with_encoder(encoder)
                .map_err(|e| TransformError::ProcessingFailed(format!("JPEG encode failed: {e}")))?;
        }
        OutputFormat::Png => {
            img.write_to(&mut buf, ImageFormat::Png)
                .map_err(|e| TransformError::ProcessingFailed(format!("PNG encode failed: {e}")))?;
        }
        OutputFormat::WebP => {
            // image クレートの WebP エンコーダはロスレスのみ対応（quality は無視）
            let encoder = WebPEncoder::new_lossless(&mut buf);
            img.write_with_encoder(encoder)
                .map_err(|e| TransformError::ProcessingFailed(format!("WebP encode failed: {e}")))?;
        }
        OutputFormat::Avif => {
            let encoder = AvifEncoder::new_with_speed_quality(&mut buf, 4, quality);
            img.write_with_encoder(encoder)
                .map_err(|e| TransformError::ProcessingFailed(format!("AVIF encode failed: {e}")))?;
        }
    }

    Ok(buf.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_jpeg() {
        let img = DynamicImage::new_rgb8(10, 10);
        let result = encode_image(&img, OutputFormat::Jpeg, 80);

        assert!(result.is_ok());
        let data = result.unwrap();
        assert!(!data.is_empty());
        // JPEG マジックナンバー確認
        assert_eq!(&data[0..2], &[0xFF, 0xD8]);
    }

    #[test]
    fn test_encode_png() {
        let img = DynamicImage::new_rgb8(10, 10);
        let result = encode_image(&img, OutputFormat::Png, 80);

        assert!(result.is_ok());
        let data = result.unwrap();
        assert!(!data.is_empty());
        // PNG マジックナンバー確認
        assert_eq!(&data[0..8], &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    }

    #[test]
    fn test_encode_webp() {
        let img = DynamicImage::new_rgb8(10, 10);
        let result = encode_image(&img, OutputFormat::WebP, 80);

        assert!(result.is_ok());
        let data = result.unwrap();
        assert!(!data.is_empty());
        // WebP は RIFF コンテナ
        assert_eq!(&data[0..4], b"RIFF");
    }

    #[test]
    fn test_encode_avif() {
        let img = DynamicImage::new_rgb8(10, 10);
        let result = encode_image(&img, OutputFormat::Avif, 80);

        assert!(result.is_ok());
        let data = result.unwrap();
        assert!(!data.is_empty());
    }
}
