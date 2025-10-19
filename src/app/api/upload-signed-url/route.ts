import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { type NextRequest, NextResponse } from "next/server";
import { parse } from "valibot";
import {
  type UploadSignedUrlResponse,
  uploadSignedUrlRequestSchema,
} from "@/app/schemas";
import { B2_S3_BUCKET, s3 } from "@/lib/s3";
import { hasMessage } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const items = parse(uploadSignedUrlRequestSchema, body);

    const results: UploadSignedUrlResponse = await Promise.all(
      items.map(async (item) => {
        // 拡張子を維持
        const ext = item.filename.split(".").pop() ?? "";
        const objectKey = `${crypto.randomUUID()}.${ext}`;

        const url = await getSignedUrl(
          s3,
          new PutObjectCommand({
            Bucket: B2_S3_BUCKET,
            ContentType: item.contentType ?? "application/octet-stream",
            Key: objectKey,
          }),
          { expiresIn: 60 * 60 },
        );

        return { key: objectKey, url };
      }),
    );

    return NextResponse.json(results);
  } catch (error) {
    return NextResponse.json(
      { error: hasMessage(error) ? error.message : "Bad Request" },
      { status: 400 },
    );
  }
}
