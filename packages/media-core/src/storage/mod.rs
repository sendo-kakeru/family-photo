pub mod client;

pub use client::StorageProxyClient;
// StorageError は errors モジュールで定義済み
pub use crate::errors::StorageError;
