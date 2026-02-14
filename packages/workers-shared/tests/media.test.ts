import { describe, expect, it } from "vitest";
import { inferMediaType } from "../src/types/media";

describe("inferMediaType", () => {
  it("画像拡張子を正しく識別する", () => {
    expect(inferMediaType("photo.jpg")).toBe("image");
    expect(inferMediaType("photo.jpeg")).toBe("image");
    expect(inferMediaType("photo.png")).toBe("image");
    expect(inferMediaType("photo.webp")).toBe("image");
    expect(inferMediaType("photo.avif")).toBe("image");
    expect(inferMediaType("photo.gif")).toBe("image");
    expect(inferMediaType("PHOTO.JPG")).toBe("image");
  });

  it("動画拡張子を正しく識別する", () => {
    expect(inferMediaType("video.mp4")).toBe("video");
    expect(inferMediaType("video.webm")).toBe("video");
    expect(inferMediaType("video.mov")).toBe("video");
    expect(inferMediaType("video.m4v")).toBe("video");
    expect(inferMediaType("VIDEO.MP4")).toBe("video");
  });

  it("その他の拡張子をotherとして返す", () => {
    expect(inferMediaType("document.pdf")).toBe("other");
    expect(inferMediaType("file.txt")).toBe("other");
    expect(inferMediaType("unknown")).toBe("other");
  });
});
