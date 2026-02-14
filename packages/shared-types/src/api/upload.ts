/**
 * /api/upload-signed-url へのリクエスト型
 */
export type UploadSignedUrlRequest = Array<{
  /** ファイル名 */
  filename: string;
  /** Content-Type */
  contentType: string;
  /** ファイルサイズ（バイト） */
  size: number;
}>;

/**
 * /api/upload-signed-url からのレスポンス型
 */
export type UploadSignedUrlResponse = Array<{
  /** 生成されたオブジェクトキー */
  key: string;
  /** 署名付きアップロードURL */
  url: string;
}>;
