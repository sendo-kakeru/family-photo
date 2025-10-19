import { S3Client } from "@aws-sdk/client-s3";

export const B2_S3_REGION = "us-west-004";
export const B2_S3_BUCKET = "family-photo";

if (!process.env.B2_KEY_ID || !process.env.B2_APP_KEY) {
  throw new Error("B2_KEY_ID and B2_APP_KEY must be set");
}
export const s3 = new S3Client({
  credentials: {
    accessKeyId: process.env.B2_KEY_ID,
    secretAccessKey: process.env.B2_APP_KEY,
  },
  endpoint: `https://s3.${B2_S3_REGION}.backblazeb2.com`,
  forcePathStyle: true,
  region: B2_S3_REGION,
});
