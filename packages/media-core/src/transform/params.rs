use crate::constants::DEFAULT_QUALITY;
use std::str::FromStr;

/// 出力フォーマット
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputFormat {
    Jpeg,
    Png,
    WebP,
    Avif,
}

impl FromStr for OutputFormat {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "jpeg" | "jpg" => Ok(Self::Jpeg),
            "png" => Ok(Self::Png),
            "webp" => Ok(Self::WebP),
            "avif" => Ok(Self::Avif),
            _ => Err(format!("Unknown format: {}", s)),
        }
    }
}

impl OutputFormat {
    /// Content-Type を取得
    pub fn content_type(&self) -> &'static str {
        match self {
            Self::Jpeg => "image/jpeg",
            Self::Png => "image/png",
            Self::WebP => "image/webp",
            Self::Avif => "image/avif",
        }
    }
}

/// 変換パラメータ
#[derive(Debug, Clone)]
pub struct TransformParams {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub format: OutputFormat,
    pub quality: u8,
}

impl TransformParams {
    /// デフォルトパラメータを作成
    pub fn new(
        width: Option<u32>,
        height: Option<u32>,
        format: OutputFormat,
        quality: Option<u8>,
    ) -> Self {
        Self {
            width,
            height,
            format,
            quality: quality.unwrap_or(DEFAULT_QUALITY),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_output_format_from_str() {
        assert_eq!("jpeg".parse::<OutputFormat>().ok(), Some(OutputFormat::Jpeg));
        assert_eq!("JPG".parse::<OutputFormat>().ok(), Some(OutputFormat::Jpeg));
        assert_eq!("png".parse::<OutputFormat>().ok(), Some(OutputFormat::Png));
        assert_eq!("webp".parse::<OutputFormat>().ok(), Some(OutputFormat::WebP));
        assert_eq!("avif".parse::<OutputFormat>().ok(), Some(OutputFormat::Avif));
        assert!("unknown".parse::<OutputFormat>().is_err());
    }

    #[test]
    fn test_content_type() {
        assert_eq!(OutputFormat::Jpeg.content_type(), "image/jpeg");
        assert_eq!(OutputFormat::Png.content_type(), "image/png");
        assert_eq!(OutputFormat::WebP.content_type(), "image/webp");
        assert_eq!(OutputFormat::Avif.content_type(), "image/avif");
    }

    #[test]
    fn test_transform_params_default_quality() {
        let params = TransformParams::new(Some(800), Some(600), OutputFormat::Jpeg, None);
        assert_eq!(params.quality, DEFAULT_QUALITY);
    }
}
