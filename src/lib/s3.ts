import { S3Client } from "@aws-sdk/client-s3";
import { env } from "./env";

export const B2_S3_REGION = "us-west-004";
export const B2_S3_BUCKET = "family-photo";

export const s3 = new S3Client({
  credentials: {
    accessKeyId: env.B2_KEY_ID,
    secretAccessKey: env.B2_APP_KEY,
  },
  endpoint: `https://s3.${B2_S3_REGION}.backblazeb2.com`,
  forcePathStyle: true,
  region: B2_S3_REGION,
});
