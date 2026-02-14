use crate::errors::MediaError;

/// オブジェクトキーを検証する
/// パストラバーサル攻撃を防止し、不正な文字を検出する
pub fn validate_key(key: &str) -> Result<(), MediaError> {
    // 空文字チェック
    if key.is_empty() {
        return Err(MediaError::Validation("key is empty".to_string()));
    }

    // 長さチェック（1024文字まで）
    if key.len() > 1024 {
        return Err(MediaError::Validation("key is too long (max 1024)".to_string()));
    }

    // URLデコード
    let decoded = urlencoding::decode(key)
        .map_err(|_| MediaError::Validation("invalid URL encoding".to_string()))?;

    // パストラバーサル防止
    if decoded.contains("..")
        || decoded.starts_with('/')
        || decoded.contains("//")
        || decoded.contains('\\')
    {
        return Err(MediaError::Validation("path traversal detected".to_string()));
    }

    // 許可された文字のみ（英数字、ハイフン、アンダースコア、ドット、スラッシュ）
    if !decoded.chars().all(|c| {
        c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' || c == '/'
    }) {
        return Err(MediaError::Validation("invalid characters in key".to_string()));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_keys() {
        assert!(validate_key("test.jpg").is_ok());
        assert!(validate_key("folder/image.png").is_ok());
        assert!(validate_key("2024/01/photo-123.webp").is_ok());
    }

    #[test]
    fn test_empty_key() {
        assert!(validate_key("").is_err());
    }

    #[test]
    fn test_path_traversal() {
        assert!(validate_key("../etc/passwd").is_err());
        assert!(validate_key("folder/../secret.txt").is_err());
        assert!(validate_key("//etc/passwd").is_err());
    }
}
