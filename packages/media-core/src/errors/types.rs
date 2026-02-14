use thiserror::Error;

/// メディア処理の統合エラー型
#[derive(Debug, Error)]
pub enum MediaError {
    #[error("validation error: {0}")]
    Validation(String),

    #[error("storage error: {0}")]
    Storage(#[from] StorageError),

    #[error("transform error: {0}")]
    Transform(#[from] TransformError),
}

/// ストレージアクセスエラー
#[derive(Debug, Error)]
pub enum StorageError {
    #[error("object not found: {key}")]
    NotFound { key: String },

    #[error("access denied")]
    Forbidden,

    #[error("storage error: {0}")]
    Internal(String),
}

/// 画像変換エラー
#[derive(Debug, Error)]
pub enum TransformError {
    #[error("invalid parameters: {0}")]
    InvalidParams(String),

    #[error("image resolution exceeds maximum ({width}x{height})")]
    ResolutionTooLarge { width: u32, height: u32 },

    #[error("processing failed: {0}")]
    ProcessingFailed(String),
}
