import {
  type _Object,
  DeleteObjectsCommand,
  type DeleteObjectsCommandOutput,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { B2_S3_BUCKET, s3 } from "@/lib/s3";

/**
 * S3 から全オブジェクトをページネーション付きで取得する
 *
 * ContinuationToken を使用して全オブジェクトを取得
 */
export async function getAllObjectsPaginated(): Promise<_Object[]> {
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

  return allItems;
}

/**
 * 全メディアを最終更新日時でソートして取得する
 *
 * @returns 新しい順にソートされたオブジェクトリスト
 */
export async function getAllMediasSorted(): Promise<_Object[]> {
  const allItems = await getAllObjectsPaginated();

  // 最終更新日時でソート（新しい順）
  allItems.sort((a, b) => {
    const dateA = a.LastModified ? new Date(a.LastModified).getTime() : 0;
    const dateB = b.LastModified ? new Date(b.LastModified).getTime() : 0;
    return dateB - dateA;
  });

  return allItems;
}

/**
 * 全オブジェクトの数をカウントする
 *
 * @returns オブジェクトの総数
 */
export async function countAllObjects(): Promise<number> {
  let totalCount = 0;
  let continuationToken: string | undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: B2_S3_BUCKET,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    });

    const response = await s3.send(command);
    const count = (response.Contents || []).length;

    totalCount += count;
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return totalCount;
}

/**
 * 複数のオブジェクトを削除する
 *
 * @param keys - 削除するオブジェクトのキーリスト
 * @returns 削除結果
 */
export async function deleteObjects(
  keys: string[],
): Promise<DeleteObjectsCommandOutput> {
  const command = new DeleteObjectsCommand({
    Bucket: B2_S3_BUCKET,
    Delete: {
      Objects: keys.map((key) => ({ Key: key })),
      Quiet: false,
    },
  });

  return await s3.send(command);
}
