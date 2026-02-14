import { describe, expect, it } from "vitest";
import { ValidationError } from "../src/errors/error-types";
import { validateQueryParams } from "../src/validation/query-validator";

describe("validateQueryParams", () => {
  it("should accept valid w and h parameters", () => {
    const params = new URLSearchParams("w=400&h=300");
    expect(() => validateQueryParams(params)).not.toThrow();
  });

  it("should accept valid format parameter", () => {
    const params = new URLSearchParams("f=webp");
    expect(() => validateQueryParams(params)).not.toThrow();
  });

  it("should accept valid quality parameter", () => {
    const params = new URLSearchParams("q=85");
    expect(() => validateQueryParams(params)).not.toThrow();
  });

  it("should reject w exceeding maximum", () => {
    const params = new URLSearchParams("w=10000");
    expect(() => validateQueryParams(params)).toThrow(ValidationError);
    expect(() => validateQueryParams(params)).toThrow(
      "幅が最大値を超えています",
    );
  });

  it("should reject h exceeding maximum", () => {
    const params = new URLSearchParams("h=10000");
    expect(() => validateQueryParams(params)).toThrow(ValidationError);
    expect(() => validateQueryParams(params)).toThrow(
      "高さが最大値を超えています",
    );
  });

  it("should reject negative w", () => {
    const params = new URLSearchParams("w=-100");
    expect(() => validateQueryParams(params)).toThrow(ValidationError);
    expect(() => validateQueryParams(params)).toThrow("幅は正の整数である必要");
  });

  it("should reject negative h", () => {
    const params = new URLSearchParams("h=-100");
    expect(() => validateQueryParams(params)).toThrow(ValidationError);
    expect(() => validateQueryParams(params)).toThrow(
      "高さは正の整数である必要",
    );
  });

  it("should reject invalid format", () => {
    const params = new URLSearchParams("f=invalid");
    expect(() => validateQueryParams(params)).toThrow(ValidationError);
    expect(() => validateQueryParams(params)).toThrow("不正なフォーマットです");
  });

  it("should accept all valid formats", () => {
    const validFormats = ["jpeg", "png", "webp", "avif"];
    for (const format of validFormats) {
      const params = new URLSearchParams(`f=${format}`);
      expect(() => validateQueryParams(params)).not.toThrow();
    }
  });

  it("should reject quality less than 1", () => {
    const params = new URLSearchParams("q=0");
    expect(() => validateQueryParams(params)).toThrow(ValidationError);
    expect(() => validateQueryParams(params)).toThrow("品質は1-100の範囲");
  });

  it("should reject quality greater than 100", () => {
    const params = new URLSearchParams("q=101");
    expect(() => validateQueryParams(params)).toThrow(ValidationError);
    expect(() => validateQueryParams(params)).toThrow("品質は1-100の範囲");
  });

  it("should accept quality at boundaries", () => {
    const params1 = new URLSearchParams("q=1");
    const params100 = new URLSearchParams("q=100");
    expect(() => validateQueryParams(params1)).not.toThrow();
    expect(() => validateQueryParams(params100)).not.toThrow();
  });

  it("should handle multiple parameters together", () => {
    const params = new URLSearchParams("w=800&h=600&f=webp&q=90");
    expect(() => validateQueryParams(params)).not.toThrow();
  });

  it("should handle no parameters", () => {
    const params = new URLSearchParams("");
    expect(() => validateQueryParams(params)).not.toThrow();
  });

  it("should reject non-numeric w", () => {
    const params = new URLSearchParams("w=abc");
    expect(() => validateQueryParams(params)).toThrow(ValidationError);
  });

  it("should reject non-numeric h", () => {
    const params = new URLSearchParams("h=abc");
    expect(() => validateQueryParams(params)).toThrow(ValidationError);
  });

  it("should reject non-numeric q", () => {
    const params = new URLSearchParams("q=abc");
    expect(() => validateQueryParams(params)).toThrow(ValidationError);
  });
});
