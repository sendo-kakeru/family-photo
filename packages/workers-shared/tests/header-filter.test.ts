import { describe, expect, it } from "vitest";
import {
  filterHeaders,
  filterHeadersFromEnv,
} from "../src/utils/header-filter";

describe("filterHeaders", () => {
  it("should allow default headers", () => {
    const headers = new Headers({
      accept: "application/json",
      "accept-encoding": "gzip, deflate",
      "if-modified-since": "Wed, 21 Oct 2015 07:28:00 GMT",
      "if-none-match": '"etag"',
      range: "bytes=0-1023",
    });

    const filtered = filterHeaders(headers);

    expect(filtered.get("range")).toBe("bytes=0-1023");
    expect(filtered.get("if-none-match")).toBe('"etag"');
    expect(filtered.get("if-modified-since")).toBe(
      "Wed, 21 Oct 2015 07:28:00 GMT",
    );
    expect(filtered.get("accept")).toBe("application/json");
    expect(filtered.get("accept-encoding")).toBe("gzip, deflate");
  });

  it("should filter out browser-specific headers", () => {
    const headers = new Headers({
      cookie: "session=abc123",
      range: "bytes=0-1023",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent": "Mozilla/5.0",
    });

    const filtered = filterHeaders(headers);

    expect(filtered.get("range")).toBe("bytes=0-1023");
    expect(filtered.get("cookie")).toBeNull();
    expect(filtered.get("sec-fetch-site")).toBeNull();
    expect(filtered.get("sec-fetch-mode")).toBeNull();
    expect(filtered.get("user-agent")).toBeNull();
  });

  it("should handle custom allowed headers", () => {
    const headers = new Headers({
      authorization: "Bearer token",
      cookie: "session=abc123",
      "custom-header": "value",
    });

    const filtered = filterHeaders(headers, ["authorization", "custom-header"]);

    expect(filtered.get("authorization")).toBe("Bearer token");
    expect(filtered.get("custom-header")).toBe("value");
    expect(filtered.get("cookie")).toBeNull();
  });

  it("should be case-insensitive", () => {
    const headers = new Headers({
      "IF-NONE-MATCH": '"etag"',
      Range: "bytes=0-1023",
    });

    const filtered = filterHeaders(headers);

    expect(filtered.get("range")).toBe("bytes=0-1023");
    expect(filtered.get("if-none-match")).toBe('"etag"');
  });

  it("should return empty headers when no allowed headers match", () => {
    const headers = new Headers({
      cookie: "session=abc123",
      "sec-fetch-site": "same-origin",
    });

    const filtered = filterHeaders(headers);

    expect([...filtered.keys()]).toHaveLength(0);
  });

  it("should handle empty headers", () => {
    const headers = new Headers();
    const filtered = filterHeaders(headers);

    expect([...filtered.keys()]).toHaveLength(0);
  });
});

describe("filterHeadersFromEnv", () => {
  it("should use default allowed headers when env is undefined", () => {
    const headers = new Headers({
      cookie: "session=abc123",
      range: "bytes=0-1023",
    });

    const filtered = filterHeadersFromEnv(headers, undefined);

    expect(filtered.get("range")).toBe("bytes=0-1023");
    expect(filtered.get("cookie")).toBeNull();
  });

  it("should use default allowed headers when env is empty array", () => {
    const headers = new Headers({
      cookie: "session=abc123",
      range: "bytes=0-1023",
    });

    const filtered = filterHeadersFromEnv(headers, []);

    expect(filtered.get("range")).toBe("bytes=0-1023");
    expect(filtered.get("cookie")).toBeNull();
  });

  it("should use custom headers from env", () => {
    const headers = new Headers({
      authorization: "Bearer token",
      cookie: "session=abc123",
      "custom-header": "value",
    });

    const filtered = filterHeadersFromEnv(headers, [
      "authorization",
      "custom-header",
    ]);

    expect(filtered.get("authorization")).toBe("Bearer token");
    expect(filtered.get("custom-header")).toBe("value");
    expect(filtered.get("cookie")).toBeNull();
  });
});
