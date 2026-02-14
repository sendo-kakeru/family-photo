use crate::constants::MAX_DIMENSION;
use crate::errors::TransformError;

/// 変換パラメータを検証する
pub fn validate_params(
    width: Option<u32>,
    height: Option<u32>,
    quality: Option<u8>,
) -> Result<(), TransformError> {
    // 品質の検証
    if let Some(q) = quality
        && (q == 0 || q > 100)
    {
        return Err(TransformError::InvalidParams(format!(
            "quality must be 1-100, got {q}"
        )));
    }

    // 幅の検証
    if let Some(w) = width
        && (w == 0 || w > MAX_DIMENSION)
    {
        return Err(TransformError::InvalidParams(format!(
            "width must be 1-{MAX_DIMENSION}, got {w}"
        )));
    }

    // 高さの検証
    if let Some(h) = height
        && (h == 0 || h > MAX_DIMENSION)
    {
        return Err(TransformError::InvalidParams(format!(
            "height must be 1-{MAX_DIMENSION}, got {h}"
        )));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_params() {
        assert!(validate_params(Some(800), Some(600), Some(80)).is_ok());
        assert!(validate_params(None, None, None).is_ok());
        assert!(validate_params(Some(1920), None, Some(90)).is_ok());
    }

    #[test]
    fn test_invalid_quality() {
        assert!(validate_params(None, None, Some(0)).is_err());
        assert!(validate_params(None, None, Some(101)).is_err());
    }

    #[test]
    fn test_invalid_dimensions() {
        assert!(validate_params(Some(0), None, None).is_err());
        assert!(validate_params(Some(5000), None, None).is_err());
        assert!(validate_params(None, Some(5000), None).is_err());
    }
}
