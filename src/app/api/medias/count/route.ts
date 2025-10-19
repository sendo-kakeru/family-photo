import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { B2_S3_BUCKET, s3 } from "@/lib/s3";

export async function GET() {
  try {
    let totalCount = 0;
    let continuationToken: string | undefined;

    do {
      const cmd = new ListObjectsV2Command({
        Bucket: B2_S3_BUCKET,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      });

      const response = await s3.send(cmd);

      const count = (response.Contents || []).length;

      totalCount += count;
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return NextResponse.json({ count: totalCount });
  } catch (error) {
    console.error("Error counting medias:", error);
    return NextResponse.json(
      { error: "Failed to count medias" },
      { status: 500 },
    );
  }
}
