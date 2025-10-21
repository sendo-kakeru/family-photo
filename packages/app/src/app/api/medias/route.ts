import { type _Object, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { type NextRequest, NextResponse } from "next/server";
import { B2_S3_BUCKET, s3 } from "@/lib/s3";

async function getAllMediasSorted(): Promise<_Object[]> {
  // 全てのオブジェクトを取得
  let allItems: _Object[] = [];
  let continuationToken: string | undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: B2_S3_BUCKET,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    });

    const response = await s3.send(command);
    if (response.Contents) {
      allItems = allItems.concat(response.Contents);
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  // 最終更新日時でソート（新しい順）
  allItems.sort((a, b) => {
    const dateA = a.LastModified ? new Date(a.LastModified).getTime() : 0;
    const dateB = b.LastModified ? new Date(b.LastModified).getTime() : 0;
    return dateB - dateA;
  });

  return allItems;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = Number(searchParams.get("page")) || 0;
  const maxKeys = Math.min(Number(searchParams.get("maxKeys")) || 100, 1000);

  try {
    // 全データをソート済みで取得
    const allItems = await getAllMediasSorted();

    // ページネーション処理
    const startIdx = page * maxKeys;
    const endIdx = startIdx + maxKeys;
    const pageItems = allItems.slice(startIdx, endIdx);
    const hasMore = endIdx < allItems.length;

    // レスポンス形式に変換
    const medias = pageItems.map((item) => ({
      key: `${item.Key}`,
      lastModified:
        item.LastModified?.toISOString() || new Date().toISOString(),
      size: item.Size || 0,
    }));

    return NextResponse.json({
      isTruncated: hasMore,
      keyCount: pageItems.length,
      medias,
      nextPage: hasMore ? page + 1 : null,
    });
  } catch (error) {
    console.error("Error listing medias:", error);
    return NextResponse.json(
      { error: "Failed to list medias" },
      { status: 500 },
    );
  }
}
