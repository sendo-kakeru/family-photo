/**
 * CDN Worker の環境変数型定義
 */
export type Env = {
  AUTH_SECRET: string;
  AUTH_SALT: string;
  ALLOW_EMAILS: string;
  MEDIA_PROCESSOR_URL: string;
  GCP_SERVICE_ACCOUNT_KEY?: string;
  STORAGE_PROXY: Service;
  STORAGE_PROXY_URL?: string;
};

/**
 * Hono 環境型
 */
export type HonoEnv = { Bindings: Env };
