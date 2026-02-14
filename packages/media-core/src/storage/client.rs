use crate::errors::StorageError;
use bytes::Bytes;

/// Storage Proxy クライアント
///
/// Cloudflare Workers の Storage Proxy に HTTP リクエストを送信して
/// B2 ストレージからオブジェクトを取得する
#[derive(Clone)]
pub struct StorageProxyClient {
    base_url: String,
    cf_access_client_id: String,
    cf_access_client_secret: String,
}

impl StorageProxyClient {
    /// 新しい StorageProxyClient を作成する
    pub fn new(
        base_url: String,
        cf_access_client_id: String,
        cf_access_client_secret: String,
    ) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            cf_access_client_id,
            cf_access_client_secret,
        }
    }

    /// 環境変数から StorageProxyClient を作成する
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

        Ok(Self::new(base_url, cf_access_client_id, cf_access_client_secret))
    }

    /// キーを指定して Storage Proxy Worker からオブジェクトを取得する
    pub async fn get_object(&self, key: &str) -> Result<Bytes, StorageError> {
        let url = format!("{}/{}", self.base_url, key);

        let client = reqwest::Client::new();
        let response = client
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
                return Err(StorageError::Forbidden);
            }
            status => {
                return Err(StorageError::Internal(format!(
                    "unexpected status: {status}"
                )));
            }
        }

        let data = response
            .bytes()
            .await
            .map_err(|e| StorageError::Internal(e.to_string()))?;

        Ok(data)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_client() {
        let client = StorageProxyClient::new(
            "https://storage.example.com/".to_string(),
            "client-id".to_string(),
            "client-secret".to_string(),
        );

        // 末尾のスラッシュが削除される
        assert_eq!(client.base_url, "https://storage.example.com");
    }

    #[test]
    fn test_from_env_missing_vars() {
        // 環境変数が設定されていない場合はエラー
        let result = StorageProxyClient::from_env();
        assert!(result.is_err());
    }
}
