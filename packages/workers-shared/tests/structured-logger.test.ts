import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  debug,
  error,
  info,
  log,
  warn,
} from "../src/logging/structured-logger";

describe("structured-logger", () => {
  beforeEach(() => {
    // console メソッドをモック
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("log", () => {
    it("should output JSON formatted log", () => {
      log("info", "test message");

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"level":"info"'),
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"message":"test message"'),
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"timestamp"'),
      );
    });

    it("should include context in log output", () => {
      log("info", "test message", { action: "login", userId: "123" });

      const call = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const parsed = JSON.parse(call);

      expect(parsed.level).toBe("info");
      expect(parsed.message).toBe("test message");
      expect(parsed.userId).toBe("123");
      expect(parsed.action).toBe("login");
      expect(parsed.timestamp).toBeDefined();
    });

    it("should use console.error for error level", () => {
      log("error", "error message");

      expect(console.error).toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalled();
    });

    it("should use console.warn for warn level", () => {
      log("warn", "warning message");

      expect(console.warn).toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalled();
    });

    it("should use console.log for debug and info levels", () => {
      log("debug", "debug message");
      log("info", "info message");

      expect(console.log).toHaveBeenCalledTimes(2);
    });
  });

  describe("debug", () => {
    it("should log with debug level", () => {
      debug("debug message");

      const call = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const parsed = JSON.parse(call);

      expect(parsed.level).toBe("debug");
      expect(parsed.message).toBe("debug message");
    });

    it("should include context", () => {
      debug("debug message", { detail: "value" });

      const call = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const parsed = JSON.parse(call);

      expect(parsed.detail).toBe("value");
    });
  });

  describe("info", () => {
    it("should log with info level", () => {
      info("info message");

      const call = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const parsed = JSON.parse(call);

      expect(parsed.level).toBe("info");
      expect(parsed.message).toBe("info message");
    });
  });

  describe("warn", () => {
    it("should log with warn level", () => {
      warn("warning message");

      const call = (console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const parsed = JSON.parse(call);

      expect(parsed.level).toBe("warn");
      expect(parsed.message).toBe("warning message");
    });
  });

  describe("error", () => {
    it("should log with error level", () => {
      error("error message");

      const call = (console.error as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const parsed = JSON.parse(call);

      expect(parsed.level).toBe("error");
      expect(parsed.message).toBe("error message");
    });

    it("should include error object details", () => {
      const err = new Error("Something went wrong");
      error("error message", err);

      const call = (console.error as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const parsed = JSON.parse(call);

      expect(parsed.error).toBeDefined();
      expect(parsed.error.name).toBe("Error");
      expect(parsed.error.message).toBe("Something went wrong");
      expect(parsed.error.stack).toBeDefined();
    });

    it("should handle error without error object", () => {
      error("error message");

      const call = (console.error as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const parsed = JSON.parse(call);

      expect(parsed.error).toBeUndefined();
    });

    it("should include additional context", () => {
      const err = new Error("Something went wrong");
      error("error message", err, { userId: "123" });

      const call = (console.error as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const parsed = JSON.parse(call);

      expect(parsed.userId).toBe("123");
      expect(parsed.error).toBeDefined();
    });
  });

  describe("timestamp", () => {
    it("should include ISO 8601 timestamp", () => {
      log("info", "test message");

      const call = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const parsed = JSON.parse(call);

      expect(parsed.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });
  });
});
