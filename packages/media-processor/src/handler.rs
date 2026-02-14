use axum::extract::{Path, Query, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde::Deserialize;

use crate::AppState;
use crate::storage::StorageError;
use crate::transform::{OutputFormat, TransformError, TransformParams};

const CACHE_CONTROL_IMMUTABLE: &str = "public, max-age=31536000, immutable";

#[derive(Debug, Deserialize)]
pub struct TransformQuery {
    #[serde(rename = "w")]
    pub width: Option<u32>,
    #[serde(rename = "h")]
    pub height: Option<u32>,
    #[serde(rename = "f")]
    pub format: Option<String>,
    #[serde(rename = "q")]
    pub quality: Option<u8>,
}

pub async fn health() -> impl IntoResponse {
    (StatusCode::OK, "ok")
}

pub async fn transform(
    State(state): State<AppState>,
    Path(key): Path<String>,
    Query(query): Query<TransformQuery>,
) -> Result<Response, AppError> {
    validate_key(&key)?;

    let format = query
        .format
        .as_deref()
        .map(|f| {
            OutputFormat::from_str_param(f).ok_or_else(|| {
                AppError::BadRequest(format!(
                    "unsupported format '{f}'. supported: jpg, png, webp, avif"
                ))
            })
        })
        .transpose()?;

    let params = TransformParams {
        width: query.width,
        height: query.height,
        format,
        quality: query.quality,
    };

    tracing::info!(key = %key, "fetching object from Storage Proxy");
    let input_bytes = state.storage_client.get_object(&key).await?;

    // メタデータ削除のため、パラメータがなくても必ずデコード→エンコードを実行
    tracing::info!(
        key = %key,
        w = ?params.width,
        h = ?params.height,
        f = ?params.format,
        q = ?params.quality,
        "transforming image"
    );

    let (output_bytes, content_type) = crate::transform::transform(&input_bytes, &params)?;

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, content_type.to_string()),
            (header::CACHE_CONTROL, CACHE_CONTROL_IMMUTABLE.to_string()),
        ],
        output_bytes,
    )
        .into_response())
}

/// パストラバーサル攻撃を防ぐためにオブジェクトキーを検証する。
fn validate_key(key: &str) -> Result<(), AppError> {
    if key.is_empty() {
        return Err(AppError::BadRequest(
            "key parameter is required".to_string(),
        ));
    }
    if key.len() > 1024 {
        return Err(AppError::BadRequest(
            "key parameter too long (max: 1024)".to_string(),
        ));
    }

    // URLデコード後の値をチェック
    let decoded = urlencoding::decode(key)
        .map_err(|_| AppError::BadRequest("invalid URL encoding".to_string()))?;

    // ホワイトリストアプローチ: 英数字、スラッシュ、ハイフン、アンダースコア、ドットのみ
    if !decoded
        .chars()
        .all(|c| c.is_alphanumeric() || c == '/' || c == '-' || c == '_' || c == '.')
    {
        return Err(AppError::BadRequest(
            "key contains invalid characters".to_string(),
        ));
    }

    // パストラバーサルパターンの検出
    if decoded.contains("..")
        || decoded.starts_with('/')
        || decoded.contains("//")
        || decoded.contains('\\')
    {
        return Err(AppError::BadRequest(
            "invalid key: path traversal detected".to_string(),
        ));
    }

    Ok(())
}

#[derive(Debug)]
#[allow(dead_code)]
pub enum AppError {
    BadRequest(String),
    NotFound(String),
    TransformFailed(String),
    StorageUnavailable(String),
    Internal(String),
}

impl From<StorageError> for AppError {
    fn from(err: StorageError) -> Self {
        match err {
            StorageError::NotFound { key } => {
                tracing::warn!(key = %key, "object not found");
                AppError::NotFound("object not found".to_string())
            }
            StorageError::Forbidden => {
                tracing::error!("access denied by Storage Proxy (check CF Access credentials)");
                AppError::StorageUnavailable("storage access denied".to_string())
            }
            StorageError::Internal(msg) => {
                tracing::error!(error = %msg, "storage error");
                AppError::StorageUnavailable("storage error".to_string())
            }
        }
    }
}

impl From<TransformError> for AppError {
    fn from(err: TransformError) -> Self {
        match err {
            TransformError::InvalidParams(msg) => {
                tracing::warn!(error = %msg, "invalid transform parameters");
                AppError::BadRequest(msg)
            }
            TransformError::ResolutionTooLarge { width, height } => {
                tracing::warn!(width = %width, height = %height, "image resolution too large");
                AppError::BadRequest(format!(
                    "image resolution {width}x{height} exceeds maximum 4096x4096"
                ))
            }
            TransformError::ProcessingFailed(msg) => {
                tracing::error!(error = %msg, "image processing failed");
                AppError::TransformFailed(msg)
            }
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg),
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, msg),
            AppError::TransformFailed(msg) => (StatusCode::UNPROCESSABLE_ENTITY, msg),
            AppError::StorageUnavailable(msg) => {
                tracing::error!(error = %msg, "storage unavailable");
                (StatusCode::BAD_GATEWAY, "storage unavailable".to_string())
            }
            AppError::Internal(msg) => {
                tracing::error!(error = %msg, "internal server error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal server error".to_string(),
                )
            }
        };

        let body = serde_json::json!({ "error": message });
        (status, axum::Json(body)).into_response()
    }
}
