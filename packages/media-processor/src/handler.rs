use axum::extract::{Path, Query, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde::Deserialize;

use crate::AppState;
use media_core::{
    validate_key, MediaError, OutputFormat, StorageError, TransformError, TransformParams,
};

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
        .and_then(OutputFormat::from_str)
        .unwrap_or(OutputFormat::Jpeg);

    let params = TransformParams::new(
        query.width,
        query.height,
        format,
        query.quality,
    );

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

    let (output_bytes, content_type): (_, &'static str) = crate::transform::transform(&input_bytes, &params)?;

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


#[derive(Debug)]
#[allow(dead_code)]
pub enum AppError {
    BadRequest(String),
    NotFound(String),
    TransformFailed(String),
    StorageUnavailable(String),
    Internal(String),
}

impl From<MediaError> for AppError {
    fn from(err: MediaError) -> Self {
        match err {
            MediaError::Validation(msg) => {
                tracing::warn!(error = %msg, "validation error");
                AppError::BadRequest(msg)
            }
            MediaError::Storage(storage_err) => storage_err.into(),
            MediaError::Transform(transform_err) => transform_err.into(),
        }
    }
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
