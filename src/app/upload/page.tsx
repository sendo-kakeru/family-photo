"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FiCheckCircle } from "react-icons/fi";
import { MdHome } from "react-icons/md";
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
  objectKey: string | null;
  presignedUrl: string | null;
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

    // バッチごとに署名取得→アップロード処理
    for (
      let batchStart = 0;
      batchStart < tasks.length;
      batchStart += PRESIGN_BATCH_SIZE
    ) {
      const batchEnd = Math.min(batchStart + PRESIGN_BATCH_SIZE, tasks.length);
      const batch = tasks.slice(batchStart, batchEnd);

      // バッチ内のタスクを署名取得中に更新
      for (let i = batchStart; i < batchEnd; i++) {
        tasks[i] = { ...tasks[i], status: "signing" };
      }
      setUploadTasks([...tasks]);

      try {
        // バッチ分の署名URL取得
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
          for (let i = batchStart; i < batchEnd; i++) {
            tasks[i] = {
              ...tasks[i],
              errorMessage: `署名取得失敗: ${presignResponse.status}`,
              status: "error",
            };
          }
          setUploadTasks([...tasks]);
          continue;
        }

        const signedUrls: UploadSignedUrlResponse =
          await presignResponse.json();

        // 署名URLをタスクに設定
        for (const [index, signedData] of signedUrls.entries()) {
          const taskIndex = batchStart + index;
          if (signedData) {
            tasks[taskIndex] = {
              ...tasks[taskIndex],
              objectKey: signedData.key,
              presignedUrl: signedData.url,
              status: "idle",
            };
          } else {
            tasks[taskIndex] = {
              ...tasks[taskIndex],
              errorMessage: "署名URLが取得できませんでした",
              status: "error",
            };
          }
        }
        setUploadTasks([...tasks]);

        // バッチ内を選択順に1つずつアップロード
        for (let i = batchStart; i < batchEnd; i++) {
          const task = tasks[i];
          const presignedUrl = task.presignedUrl;

          if (!presignedUrl) {
            tasks[i] = {
              ...tasks[i],
              errorMessage: "署名URLがありません",
              status: "error",
            };
            setUploadTasks([...tasks]);
            continue;
          }

          // アップロード開始
          tasks[i] = {
            ...tasks[i],
            progressPercent: 0,
            status: "uploading",
          };
          setUploadTasks([...tasks]);

          try {
            // XMLHttpRequestでアップロード
            await new Promise<void>((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.open("PUT", presignedUrl, true);
              xhr.setRequestHeader(
                "Content-Type",
                task.file.type || "application/octet-stream",
              );

              xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                  const percent = Math.floor(
                    (event.loaded / event.total) * 100,
                  );
                  tasks[i] = { ...tasks[i], progressPercent: percent };
                  setUploadTasks([...tasks]);
                }
              };

              xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                  tasks[i] = {
                    ...tasks[i],
                    progressPercent: 100,
                    status: "done",
                  };
                  setUploadTasks([...tasks]);
                  resolve();
                } else {
                  reject(new Error(`アップロード失敗: ${xhr.status}`));
                }
              };

              xhr.onerror = () => reject(new Error("ネットワークエラー"));
              xhr.send(task.file);
            });
          } catch (error) {
            console.error("Upload error:", error);
            tasks[i] = {
              ...tasks[i],
              errorMessage: hasMessage(error)
                ? error.message
                : "アップロード失敗",
              status: "error",
            };
            setUploadTasks([...tasks]);
          }
        }
      } catch (error) {
        console.error("Batch error:", error);
        for (let i = batchStart; i < batchEnd; i++) {
          if (tasks[i].status === "signing") {
            tasks[i] = {
              ...tasks[i],
              errorMessage: hasMessage(error)
                ? error.message
                : "バッチ処理エラー",
              status: "error",
            };
          }
        }
        setUploadTasks([...tasks]);
      }
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
        <div className="flex items-center gap-x-4">
          <Button asChild variant="outline">
            <Link href="/">
              <MdHome className="size-4" />
              ホームへ戻る
            </Link>
          </Button>
          <p className="text-gray-600 text-sm">
            {completedCount}/{uploadTasks.length} 完了
          </p>
        </div>
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
        {uploadTasks.map((task, index) => {
          const isDone = task.status === "done";
          return (
            <li
              className="rounded border p-3"
              key={`${index}-${task.file.name}`}
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
