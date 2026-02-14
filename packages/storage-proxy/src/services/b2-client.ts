import { AwsClient } from "aws4fetch";
import type { Env } from "../types";

/**
 * B2 クライアントを作成する
 *
 * AWS Signature V4 を使用して B2 API にアクセスするためのクライアント
 *
 * @param env - Worker 環境変数
 * @returns AWS クライアント
 */
export function createB2Client(env: Env): AwsClient {
  return new AwsClient({
    accessKeyId: env.B2_KEY_ID,
    secretAccessKey: env.B2_APP_KEY,
    service: "s3",
  });
}

/**
 * リクエストに AWS Signature V4 を付与する
 *
 * @param client - AWS クライアント
 * @param url - リクエスト URL
 * @param headers - リクエストヘッダー
 * @returns 署名付きリクエスト
 */
export async function signRequest(
  client: AwsClient,
  url: string,
  headers: Headers,
): Promise<Request> {
  return await client.sign(url, {
    headers: headers,
    method: "GET",
  });
}
