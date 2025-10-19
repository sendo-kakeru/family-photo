"use client";

import { useMemo, useState } from "react";
import { FiCheckCircle } from "react-icons/fi";
import {
  instance,
  maxValue,
  minValue,
  number,
  object,
  parse,
  pipe,
} from "valibot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hasMessage, toMiB } from "@/lib/utils";
import type {
  UploadSignedUrlRequest,
  UploadSignedUrlResponse,
} from "../schemas";

/** 単一PUTの上限（5GB） */
const MAX_SINGLE_PUT_BYTES = 5 * 1024 * 1024 * 1024;
/** 署名URLを一度に発行する件数 */
const PRESIGN_BATCH_SIZE = 200;
/** 同時に走らせるPUTの最大数 */
const MAX_CONCURRENT_PUTS = 5;

type UploadTaskStatus = "idle" | "signing" | "uploading" | "done" | "error";

const STATUS_LABEL: Record<UploadTaskStatus, string> = {
  done: "完了",
  error: "エラー",
  idle: "待機中",
  signing: "署名取得中",
  uploading: "アップロード中",
};

type UploadTask = {
  file: File;
  objectKey: string | null; // S3/B2 上のキー
  presignedUrl: string | null; // PUT用の署名URL
  progressPercent: number;
  status: UploadTaskStatus;
  errorMessage?: string;
};

const PickedFileSchema = object({
  file: instance(File),
  size: pipe(number(), minValue(1), maxValue(MAX_SINGLE_PUT_BYTES)),
});

export default function UploadPage() {
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextTasks: UploadTask[] = [];
    for (const file of event.target.files
      ? Array.from(event.target.files)
      : []) {
      try {
        parse(PickedFileSchema, { file, size: file.size });
        nextTasks.push({
          file,
          objectKey: null,
          presignedUrl: null,
          progressPercent: 0,
          status: "idle",
        });
      } catch {
        console.warn(
          `Skip: ${file.name} (${file.type}, ${toMiB(file.size)} MiB)`,
        );
      }
    }
    setUploadTasks(nextTasks);
  };

  const handleUpload = async () => {
    if (!uploadTasks.length) return;
    setIsUploading(true);

    const tasks = [...uploadTasks];

    // presign → PUT をバッチで進行
    for (
      let batchStart = 0;
      batchStart < tasks.length;
      batchStart += PRESIGN_BATCH_SIZE
    ) {
      const batch = tasks.slice(batchStart, batchStart + PRESIGN_BATCH_SIZE);

      // サイン状態に更新
      batch.forEach((_, i) => {
        const idx = batchStart + i;
        tasks[idx] = { ...tasks[idx], progressPercent: 0, status: "signing" };
      });
      setUploadTasks([...tasks]);

      // 署名URLの一括発行
      const presignResponse = await fetch("/api/upload-signed-url", {
        body: JSON.stringify(
          batch.map((task) => ({
            contentType: task.file.type || "application/octet-stream",
            filename: task.file.name,
            size: task.file.size,
          })) satisfies UploadSignedUrlRequest,
        ),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      if (!presignResponse.ok) {
        batch.forEach((_, i) => {
          const idx = batchStart + i;
          tasks[idx] = {
            ...tasks[idx],
            errorMessage: `presign failed: ${presignResponse.status}`,
            status: "error",
          };
        });
        setUploadTasks([...tasks]);
        continue;
      }

      const targets: UploadSignedUrlResponse = await presignResponse.json();

      // 署名結果をタスクに反映
      batch.forEach((_, i) => {
        const idx = batchStart + i;
        tasks[idx] = {
          ...tasks[idx],
          objectKey: targets[i]?.key ?? null,
          presignedUrl: targets[i]?.url ?? null,
        };
      });
      setUploadTasks([...tasks]);

      // PUT を並列実行
      let nextInBatch = 0;
      const uploadOne = async (localIndex: number) => {
        const taskIndex = batchStart + localIndex;
        const task = tasks[taskIndex];
        if (!task || !task.presignedUrl) return;

        tasks[taskIndex] = { ...task, progressPercent: 0, status: "uploading" };
        setUploadTasks([...tasks]);

        try {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", task.presignedUrl, true);
          xhr.setRequestHeader(
            "Content-Type",
            task.file.type || "application/octet-stream",
          );
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.floor((e.loaded / e.total) * 100);
              tasks[taskIndex] = { ...tasks[taskIndex], progressPercent: pct };
              setUploadTasks([...tasks]);
            }
          };
          await new Promise<void>((resolve, reject) => {
            xhr.onload = () =>
              xhr.status >= 200 && xhr.status < 300
                ? resolve()
                : reject(new Error(`PUT ${xhr.status}`));
            xhr.onerror = () => reject(new Error("network error"));
            xhr.send(task.file);
          });

          tasks[taskIndex] = {
            ...tasks[taskIndex],
            progressPercent: 100,
            status: "done",
          };
          setUploadTasks([...tasks]);
        } catch (err) {
          tasks[taskIndex] = {
            ...tasks[taskIndex],
            errorMessage: hasMessage(err)
              ? err.message
              : "ファイルのアップロードに失敗しました",
            status: "error",
          };
          setUploadTasks([...tasks]);
        }

        const pick = nextInBatch++;
        if (pick < batch.length) await uploadOne(pick);
      };

      const workers = Math.min(MAX_CONCURRENT_PUTS, batch.length);
      nextInBatch = workers;
      await Promise.all(
        Array.from({ length: workers }, (_, i) => uploadOne(i)),
      );
    }

    setIsUploading(false);
  };

  const completedCount = useMemo(
    () => uploadTasks.filter((task) => task.status === "done").length,
    [uploadTasks],
  );

  return (
    <main className="grid h-fit gap-8 pt-10">
      <div className="grid gap-y-4">
        <p className="text-gray-600 text-sm">
          {completedCount}/{uploadTasks.length} 完了
        </p>
        <div>
          <Input multiple onChange={handleFileSelection} type="file" />
        </div>
        <Button
          className="w-fit"
          disabled={!uploadTasks.length || isUploading}
          onClick={handleUpload}
        >
          アップロード開始
        </Button>
      </div>

      <ul className="grid gap-2">
        {uploadTasks.map((task) => {
          const isDone = task.status === "done";
          return (
            <li
              className="rounded border p-3"
              key={(task.objectKey ?? task.file.name) + task.file.size}
            >
              <div className="flex items-center gap-2 text-sm">
                <FiCheckCircle
                  aria-label={isDone ? "完了" : "未完了"}
                  className={
                    isDone
                      ? "shrink-0 text-emerald-600"
                      : "shrink-0 text-gray-300"
                  }
                />
                <span>
                  {task.file.name}{" "}
                  <span className="text-gray-500">
                    ({toMiB(task.file.size)} MiB)
                  </span>
                </span>
              </div>

              <div className="mt-2 h-2 overflow-hidden rounded bg-gray-200">
                <div
                  className="h-2 bg-blue-500 transition-all"
                  style={{ width: `${task.progressPercent}%` }}
                />
              </div>

              <div className="mt-1 text-xs">
                {STATUS_LABEL[task.status]}
                {task.errorMessage ? ` - ${task.errorMessage}` : ""}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
