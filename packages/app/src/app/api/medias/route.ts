import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { type NextRequest, NextResponse } from "next/server";
import { B2_S3_BUCKET, s3 } from "@/lib/s3";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const continuationToken = searchParams.get("continuationToken");

  try {
    const command = new ListObjectsV2Command({
      Bucket: B2_S3_BUCKET,
      ContinuationToken: continuationToken || undefined,
      MaxKeys: Math.min(Number(searchParams.get("maxKeys")) || 50, 1000),
    });

    const response = await s3.send(command);

    const items = response.Contents || [];

    // 各ファイルに署名付きURLを生成
    const medias = await Promise.all(
      items.map(async (item) => ({
        key: `${item.Key}`,
        lastModified: item.LastModified,
        size: item.Size,
      })),
    );

    return NextResponse.json({
      isTruncated: response.IsTruncated,
      keyCount: response.KeyCount,
      medias,
      nextContinuationToken: response.NextContinuationToken,
    });
  } catch (error) {
    console.error("Error listing medias:", error);
    return NextResponse.json(
      { error: "Failed to list medias" },
      { status: 500 },
    );
  }
}
