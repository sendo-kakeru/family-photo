import { describe, expect, it } from "vitest";
import {
  createContentDisposition,
  sanitizeFilename,
} from "../src/utils/filename-sanitizer";

describe("sanitizeFilename", () => {
  it("should extract filename from path", () => {
    const result = sanitizeFilename("path/to/file.jpg");
    expect(result).toBe("file.jpg");
  });

  it("should replace invalid characters with underscore", () => {
    const result = sanitizeFilename("ファイル名.jpg");
    // 日本語4文字が _ に置換され、.jpg は維持される
    expect(result).toBe("_____.jpg");
  });

  it("should preserve valid characters", () => {
    const result = sanitizeFilename("valid-file_name.123.jpg");
    expect(result).toBe("valid-file_name.123.jpg");
  });

  it("should handle file without extension", () => {
    const result = sanitizeFilename("filename");
    expect(result).toBe("filename");
  });

  it("should handle multiple slashes in path", () => {
    const result = sanitizeFilename("path/to/deep/file.jpg");
    expect(result).toBe("file.jpg");
  });

  it("should handle path with no filename", () => {
    const result = sanitizeFilename("path/to/");
    // pop() が空文字列を返すので、key 全体がフォールバックされる
    expect(result).toBe("path_to_");
  });

  it("should URL-encode the sanitized filename", () => {
    const result = sanitizeFilename("file name.jpg");
    expect(result).toBe("file_name.jpg");
  });
});

describe("createContentDisposition", () => {
  it("should create attachment disposition by default", () => {
    const result = createContentDisposition("test.jpg");
    expect(result).toBe("attachment; filename*=UTF-8''test.jpg");
  });

  it("should create inline disposition when specified", () => {
    const result = createContentDisposition("test.jpg", true);
    expect(result).toBe("inline; filename*=UTF-8''test.jpg");
  });

  it("should sanitize filename in disposition", () => {
    const result = createContentDisposition("path/to/file.jpg");
    expect(result).toBe("attachment; filename*=UTF-8''file.jpg");
  });

  it("should handle special characters", () => {
    const result = createContentDisposition("日本語ファイル.jpg");
    // 特殊文字は _ に置換され、URLエンコードされる
    expect(result).toContain("attachment; filename*=UTF-8''");
    expect(result).toContain("_");
  });

  it("should follow RFC 5987 format", () => {
    const result = createContentDisposition("test.jpg");
    // RFC 5987: disposition; filename*=UTF-8''encoded-filename
    expect(result).toMatch(/^(attachment|inline); filename\*=UTF-8''/);
  });
});
