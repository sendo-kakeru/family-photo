import type { Context } from "hono";
import {
  AuthenticationError,
  StorageError,
  ValidationError,
} from "./error-types";

/**
 * エラーを適切なHTTPレスポンスに変換する
 */
export function handleError(error: unknown, c: Context): Response {
  // ValidationError
  if (error instanceof ValidationError) {
    return c.json({ error: error.message }, 400);
  }

  // AuthenticationError
  if (error instanceof AuthenticationError) {
    return c.json({ error: error.message }, 401);
  }

  // StorageError
  if (error instanceof StorageError) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: error.statusCode,
    });
  }

  // Unknown error
  console.error("Unexpected error:", error);
  return c.json({ error: "Internal Server Error" }, 500);
}
