import { describe, expect, it } from "vitest";
import { ValidationError } from "../src/errors/error-types";
import { validateKey } from "../src/validation/key-validator";

describe("validateKey", () => {
  it("正常なキーを受け入れる", () => {
    expect(() => validateKey("test.jpg")).not.toThrow();
    expect(() => validateKey("folder/image.png")).not.toThrow();
    expect(() => validateKey("2024/01/photo-123.webp")).not.toThrow();
    expect(() => validateKey("file_name-123.avif")).not.toThrow();
  });

  it("空文字を拒否する", () => {
    expect(() => validateKey("")).toThrow(ValidationError);
    expect(() => validateKey("")).toThrow("キーが空です");
  });

  it("パストラバーサルを拒否する", () => {
    expect(() => validateKey("../etc/passwd")).toThrow(ValidationError);
    expect(() => validateKey("folder/../secret.txt")).toThrow(ValidationError);
    expect(() => validateKey("//etc/passwd")).toThrow(ValidationError);
    expect(() => validateKey("/absolute/path.jpg")).toThrow(ValidationError);
    expect(() => validateKey("folder\\\\file.txt")).toThrow(ValidationError);
  });

  it("不正な文字を拒否する", () => {
    expect(() => validateKey("file name.jpg")).toThrow(ValidationError);
    expect(() => validateKey("file<script>.jpg")).toThrow(ValidationError);
    expect(() => validateKey("file|test.jpg")).toThrow(ValidationError);
  });

  it("長すぎるキーを拒否する", () => {
    const longKey = "a".repeat(1025);
    expect(() => validateKey(longKey)).toThrow(ValidationError);
    expect(() => validateKey(longKey)).toThrow("キーが長すぎます");
  });
});
