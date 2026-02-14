/**
 * Storage Proxy Worker の環境変数型定義
 */
export type Env = {
  BUCKET_NAME: string;
  B2_ENDPOINT: string;
  B2_KEY_ID: string;
  B2_APP_KEY: string;
  ALLOW_LIST_BUCKET?: string;
  RCLONE_DOWNLOAD?: string;
  ALLOWED_HEADERS?: string[];
  APP_HOST: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
};

/**
 * Hono 環境型
 */
export type HonoEnv = { Bindings: Env };
