import { AwsClient } from "aws4fetch";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";

type Env = {
  BUCKET_NAME: string;
  B2_ENDPOINT: string;
  B2_APPLICATION_KEY_ID: string;
  B2_APPLICATION_KEY: string;
  ALLOW_LIST_BUCKET?: string;
  RCLONE_DOWNLOAD?: string;
  ALLOWED_HEADERS?: string[];
  APP_HOST: string;
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
];

const HTTPS_PROTOCOL = "https:";
const HTTPS_PORT = "443";
const RANGE_RETRY_ATTEMPTS = 3;

function filterHeaders(headers: Headers, env: Env): Headers {
  return new Headers(
    Array.from(headers.entries()).filter(
      ([key]) =>
        !(
          UNSIGNABLE_HEADERS.includes(key) ||
          key.startsWith("cf-") ||
          (env.ALLOWED_HEADERS && !env.ALLOWED_HEADERS.includes(key))
        ),
    ),
  );
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
  let requestUrl: URL;

  try {
    requestUrl = new URL(request.url);
  } catch (error) {
    console.error("Error in handleProxy:", error);
    return c.text("Internal Server Error", 500);
  }

  requestUrl.protocol = HTTPS_PROTOCOL;
  requestUrl.port = HTTPS_PORT;

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
      requestUrl.hostname = env.B2_ENDPOINT;
      break;
    case "$host":
      requestUrl.hostname = `${requestUrl.hostname.split(".")[0]}.${env.B2_ENDPOINT}`;
      break;
    default:
      requestUrl.hostname = `${env.BUCKET_NAME}.${env.B2_ENDPOINT}`;
      break;
  }

  const headers = filterHeaders(request.headers, env);

  const client = new AwsClient({
    accessKeyId: env.B2_APPLICATION_KEY_ID,
    secretAccessKey: env.B2_APPLICATION_KEY,
    service: "s3",
  });

  if (rcloneDownload) {
    if (env.BUCKET_NAME === "$path") {
      requestUrl.pathname = path.replace(/^file\//, "");
    } else {
      requestUrl.pathname = path.replace(/^file\/[^/]+\//, "");
    }
  }

  const signedRequest = await client.sign(requestUrl.toString(), {
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
app.use("*", async (c, next) => {
  const corsMiddleware = cors({
    allowHeaders: ["*"],
    allowMethods: ["GET", "HEAD"],
    origin: [`https://${c.env.APP_HOST}`, "http://localhost:3000"],
  });
  const ALLOW_HOSTS = new Set<string>([c.env.APP_HOST, "localhost"]);
  let hostname: string;
  try {
    hostname = new URL(c.req.header("Referer") ?? "").hostname.toLowerCase();
  } catch (error) {
    console.error("Invalid Referer header:", c.req.header("Referer"), error);
    return c.text("Bad Request", 400);
  }
  if (!ALLOW_HOSTS.has(hostname)) {
    return c.text("Bad Request", 400);
  }
  return corsMiddleware(c, next);
});
app.get("*", (c) => handleProxy(c, "GET"));
app.on("HEAD", "*", (c) => handleProxy(c, "HEAD"));

app.all("*", (c) => {
  return c.text("Method Not Allowed", 405);
});

export default app;
