use crate::constants::DEFAULT_QUALITY;

/// 出力フォーマット
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputFormat {
    Jpeg,
    Png,
    WebP,
    Avif,
}

impl OutputFormat {
    /// 文字列から OutputFormat を作成
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "jpeg" | "jpg" => Some(Self::Jpeg),
            "png" => Some(Self::Png),
            "webp" => Some(Self::WebP),
            "avif" => Some(Self::Avif),
            _ => None,
        }
    }

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
        assert_eq!(OutputFormat::from_str("jpeg"), Some(OutputFormat::Jpeg));
        assert_eq!(OutputFormat::from_str("JPG"), Some(OutputFormat::Jpeg));
        assert_eq!(OutputFormat::from_str("png"), Some(OutputFormat::Png));
        assert_eq!(OutputFormat::from_str("webp"), Some(OutputFormat::WebP));
        assert_eq!(OutputFormat::from_str("avif"), Some(OutputFormat::Avif));
        assert_eq!(OutputFormat::from_str("unknown"), None);
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
