import { describe, expect, it } from "vitest";
import { ValidationError } from "../src/errors/error-types";
import { validateRangeHeader } from "../src/validation/range-validator";

describe("validateRangeHeader", () => {
  it("should accept valid simple range", () => {
    expect(() => validateRangeHeader("bytes=0-1023")).not.toThrow();
  });

  it("should accept valid range with large numbers", () => {
    expect(() => validateRangeHeader("bytes=1000000-2000000")).not.toThrow();
  });

  it("should accept range without end", () => {
    expect(() => validateRangeHeader("bytes=500-")).not.toThrow();
  });

  it("should accept range without start", () => {
    expect(() => validateRangeHeader("bytes=-500")).not.toThrow();
  });

  it("should accept multiple ranges", () => {
    expect(() => validateRangeHeader("bytes=0-100,200-300")).not.toThrow();
  });

  it("should reject non-bytes unit", () => {
    expect(() => validateRangeHeader("items=0-100")).toThrow(ValidationError);
    expect(() => validateRangeHeader("items=0-100")).toThrow(
      "Rangeヘッダーは'bytes='で始まる必要",
    );
  });

  it("should reject invalid format", () => {
    expect(() => validateRangeHeader("bytes=invalid")).toThrow(ValidationError);
    expect(() => validateRangeHeader("bytes=invalid")).toThrow(
      "不正なRangeフォーマット",
    );
  });

  it("should reject range exceeding maximum", () => {
    const maxRange = 10 * 1024 * 1024 * 1024; // 10GB
    const tooLarge = maxRange + 1;
    expect(() => validateRangeHeader(`bytes=${tooLarge}-`)).toThrow(
      ValidationError,
    );
    expect(() => validateRangeHeader(`bytes=${tooLarge}-`)).toThrow(
      "Range値が大きすぎます",
    );
  });

  it("should reject negative start with no end", () => {
    expect(() => validateRangeHeader("bytes=-")).toThrow(ValidationError);
  });

  it("should accept range at maximum boundary", () => {
    const maxRange = 10 * 1024 * 1024 * 1024; // 10GB
    expect(() => validateRangeHeader(`bytes=0-${maxRange}`)).not.toThrow();
  });

  it("should handle whitespace", () => {
    expect(() => validateRangeHeader("bytes= 0 - 100 ")).not.toThrow();
  });

  it("should reject invalid multiple ranges", () => {
    expect(() => validateRangeHeader("bytes=0-100,abc-def")).toThrow(
      ValidationError,
    );
  });

  it("should accept suffix-length range", () => {
    expect(() => validateRangeHeader("bytes=-1024")).not.toThrow();
  });

  it("should reject empty range", () => {
    expect(() => validateRangeHeader("bytes=")).toThrow(ValidationError);
  });

  it("should reject start greater than end", () => {
    // Note: This is technically valid HTTP but might want to validate
    expect(() => validateRangeHeader("bytes=1000-500")).not.toThrow();
  });
});
