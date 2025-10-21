import { AwsClient } from "aws4fetch";
import { type Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import { decode } from "next-auth/jwt";

type Env = {
  BUCKET_NAME: string;
  B2_ENDPOINT: string;
  B2_APPLICATION_KEY_ID: string;
  B2_APPLICATION_KEY: string;
  ALLOW_LIST_BUCKET?: string;
  RCLONE_DOWNLOAD?: string;
  AUTH_SECRET: string;
  AUTH_SALT: string;
  ALLOW_EMAILS: string;
};

type HonoEnv = { Bindings: Env };

const app = new Hono<HonoEnv>();

const UNSIGNABLE_HEADERS = [
  "x-forwarded-proto",
  "x-real-ip",
  "accept-encoding",
  "if-match",
  "if-modified-since",
  "if-none-match",
  "if-range",
  "if-unmodified-since",
] as const;

const HTTPS_PROTOCOL = "https:";
const HTTPS_PORT = "443";
const RANGE_RETRY_ATTEMPTS = 3;

function filterHeaders(headers: Headers): Headers {
  const filteredHeaders = new Headers();
  headers.forEach((value, key) => {
    if (
      !UNSIGNABLE_HEADERS.includes(
        key as (typeof UNSIGNABLE_HEADERS)[number],
      ) &&
      !key.startsWith("cf-")
    ) {
      filteredHeaders.set(key, value);
    }
  });

  return filteredHeaders;
}

function createHeadResponse(response: Response): Response {
  return new Response(null, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function isListBucketRequest(env: Env, path: string): boolean {
  const pathSegments = path.split("/");
  return (
    (env.BUCKET_NAME === "$path" && pathSegments.length < 2) ||
    (env.BUCKET_NAME !== "$path" && path.length === 0)
  );
}

async function handleProxy(c: Context<HonoEnv>, method: "GET" | "HEAD") {
  const env = c.env;
  const request = c.req.raw;
  const url = new URL(request.url);
  const ALLOW_EMAILS = new Set(
    c.env.ALLOW_EMAILS?.split(",")
      .map((split) => split.trim().toLowerCase())
      .filter(Boolean),
  );
  const token = getCookie(c, "authjs.session-token");

  if (!token) return c.text("Unauthorized", 401);

  try {
    const decodedToken = await decode({
      salt: env.AUTH_SALT,
      secret: env.AUTH_SECRET,
      token,
    });
    if (ALLOW_EMAILS.has(decodedToken?.email?.toLowerCase() ?? ""))
      throw new Error("Forbidden");
  } catch {
    return c.text("Forbidden", 403);
  }

  url.protocol = HTTPS_PROTOCOL;
  url.port = HTTPS_PORT;

  // URLからパスを直接取得
  const requestUrl = new URL(c.req.url);
  let path = requestUrl.pathname.substring(1); // 先頭の "/" を削除
  path = path.replace(/\/$/, ""); // 末尾の "/" を削除

  if (
    isListBucketRequest(env, path) &&
    String(env.ALLOW_LIST_BUCKET) !== "true"
  ) {
    return c.notFound();
  }

  const rcloneDownload = String(env.RCLONE_DOWNLOAD) === "true";

  switch (env.BUCKET_NAME) {
    case "$path":
      url.hostname = env.B2_ENDPOINT;
      break;
    case "$host":
      url.hostname = `${url.hostname.split(".")[0]}.${env.B2_ENDPOINT}`;
      break;
    default:
      url.hostname = `${env.BUCKET_NAME}.${env.B2_ENDPOINT}`;
      break;
  }

  const headers = filterHeaders(request.headers);

  const client = new AwsClient({
    accessKeyId: env.B2_APPLICATION_KEY_ID,
    secretAccessKey: env.B2_APPLICATION_KEY,
    service: "s3",
  });

  if (rcloneDownload) {
    if (env.BUCKET_NAME === "$path") {
      url.pathname = path.replace(/^file\//, "");
    } else {
      url.pathname = path.replace(/^file\/[^/]+\//, "");
    }
  }

  const signedRequest = await client.sign(url.toString(), {
    headers: headers,
    method: "GET",
  });

  if (signedRequest.headers.has("range")) {
    let attempts = RANGE_RETRY_ATTEMPTS;
    let response: Response;
    do {
      const controller = new AbortController();
      response = await fetch(signedRequest.url, {
        headers: signedRequest.headers,
        method: signedRequest.method,
        signal: controller.signal,
      });
      if (response.headers.has("content-range")) {
        if (attempts < RANGE_RETRY_ATTEMPTS) {
          console.log(
            `Retry for ${signedRequest.url} succeeded - response has content-range header`,
          );
        }
        break;
        // biome-ignore lint/style/noUselessElse: no problem
      } else if (response.ok) {
        attempts -= 1;
        console.error(
          `Range header in request for ${signedRequest.url} but no content-range header in response. Will retry ${attempts} more times`,
        );
        if (attempts > 0) {
          controller.abort();
        }
      } else {
        break;
      }
    } while (attempts > 0);

    if (attempts <= 0) {
      console.error(
        `Tried range request for ${signedRequest.url} ${RANGE_RETRY_ATTEMPTS} times, but no content-range in response.`,
      );
    }

    if (method === "HEAD") {
      return createHeadResponse(response);
    }

    return response;
  }

  const fetchPromise = fetch(signedRequest);

  if (method === "HEAD") {
    const response = await fetchPromise;
    return createHeadResponse(response);
  }

  return fetchPromise;
}

app.get("*", (c) => handleProxy(c, "GET"));
app.on("HEAD", "*", (c) => handleProxy(c, "HEAD"));

app.all("*", (c) => {
  return c.text("Method Not Allowed", 405);
});

export default app;
