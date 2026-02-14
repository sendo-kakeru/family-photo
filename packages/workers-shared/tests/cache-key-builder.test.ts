import { describe, expect, it } from "vitest";
import { buildCacheKey } from "../src/cache/cache-key-builder";

describe("buildCacheKey", () => {
  it("should build cache key with download parameter", () => {
    const url = "https://example.com/test.jpg";
    const cacheKey = buildCacheKey(url, true);

    expect(cacheKey.url).toBe("https://example.com/test.jpg?download=true");
  });

  it("should build cache key with transform parameters", () => {
    const url = "https://example.com/test.jpg?w=400&h=300&f=WEBP&q=85";
    const cacheKey = buildCacheKey(url, false);

    // パラメータが正規化される（f は小文字、w/h/q は数値化）
    expect(cacheKey.url).toBe(
      "https://example.com/test.jpg?w=400&h=300&f=webp&q=85",
    );
  });

  it("should normalize format parameter to lowercase", () => {
    const url = "https://example.com/test.jpg?f=AVIF";
    const cacheKey = buildCacheKey(url, false);

    expect(cacheKey.url).toBe("https://example.com/test.jpg?f=avif");
  });

  it("should normalize numeric parameters", () => {
    const url = "https://example.com/test.jpg?w=0400&h=0300&q=085";
    const cacheKey = buildCacheKey(url, false);

    expect(cacheKey.url).toBe("https://example.com/test.jpg?w=400&h=300&q=85");
  });

  it("should ignore non-transform parameters", () => {
    const url = "https://example.com/test.jpg?w=400&custom=value&h=300";
    const cacheKey = buildCacheKey(url, false);

    // custom パラメータは無視される
    expect(cacheKey.url).toBe("https://example.com/test.jpg?w=400&h=300");
  });

  it("should handle URL without query parameters", () => {
    const url = "https://example.com/test.jpg";
    const cacheKey = buildCacheKey(url, false);

    expect(cacheKey.url).toBe("https://example.com/test.jpg");
  });

  it("should preserve pathname", () => {
    const url = "https://example.com/path/to/image.jpg?w=400";
    const cacheKey = buildCacheKey(url, false);

    expect(cacheKey.url).toBe("https://example.com/path/to/image.jpg?w=400");
  });
});
