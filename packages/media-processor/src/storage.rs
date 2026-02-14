use bytes::Bytes;
use reqwest::Client;

#[derive(Clone)]
pub struct StorageProxyClient {
    client: Client,
    base_url: String,
    cf_access_client_id: String,
    cf_access_client_secret: String,
}

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("object not found: {key}")]
    NotFound { key: String },

    #[error("access denied")]
    Forbidden,

    #[error("storage error: {0}")]
    Internal(String),
}


impl StorageProxyClient {
    /// 環境変数から StorageProxyClient を作成する。
    ///
    /// 必須の環境変数:
    /// - STORAGE_PROXY_URL
    /// - CF_ACCESS_CLIENT_ID
    /// - CF_ACCESS_CLIENT_SECRET
    pub fn from_env() -> Result<Self, String> {
        let base_url = std::env::var("STORAGE_PROXY_URL")
            .map_err(|_| "STORAGE_PROXY_URL is not set".to_string())?;
        let cf_access_client_id = std::env::var("CF_ACCESS_CLIENT_ID")
            .map_err(|_| "CF_ACCESS_CLIENT_ID is not set".to_string())?;
        let cf_access_client_secret = std::env::var("CF_ACCESS_CLIENT_SECRET")
            .map_err(|_| "CF_ACCESS_CLIENT_SECRET is not set".to_string())?;

        let client = Client::new();

        Ok(Self {
            client,
            base_url: base_url.trim_end_matches('/').to_string(),
            cf_access_client_id,
            cf_access_client_secret,
        })
    }

    /// キーを指定して Storage Proxy Worker からオブジェクトを取得する。
    pub async fn get_object(&self, key: &str) -> Result<Bytes, StorageError> {
        let url = format!("{}/{}", self.base_url, key);

        let response = self
            .client
            .get(&url)
            .header("CF-Access-Client-Id", &self.cf_access_client_id)
            .header("CF-Access-Client-Secret", &self.cf_access_client_secret)
            .send()
            .await
            .map_err(|e| StorageError::Internal(e.to_string()))?;

        match response.status() {
            status if status.is_success() => {}
            reqwest::StatusCode::NOT_FOUND => {
                return Err(StorageError::NotFound {
                    key: key.to_string(),
                });
            }
            reqwest::StatusCode::FORBIDDEN => {
                tracing::error!(key = %key, "access denied by Storage Proxy");
                return Err(StorageError::Forbidden);
            }
            status => {
                tracing::error!(key = %key, status = %status, "unexpected response from Storage Proxy");
                return Err(StorageError::Internal(format!(
                    "unexpected status: {status}"
                )));
            }
        }

        let data = response
            .bytes()
            .await
            .map_err(|e| StorageError::Internal(e.to_string()))?;

        // 読み込み後にもサイズを確認
        let actual_size = data.len() as u64;
        if actual_size > MAX_INPUT_SIZE {
            return Err(StorageError::TooLarge {
                size: actual_size,
                max: MAX_INPUT_SIZE,
            });
        }

        Ok(data)
    }
}
