import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get("authjs.session-token")?.value;
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get("path");

    if (!path) {
      return new NextResponse("Path parameter is required", { status: 400 });
    }

    // CDNからファイルを取得
    const cdnUrl = `${process.env.NEXT_PUBLIC_CDN_ORIGIN}/${path}`;

    const response = await fetch(
      cdnUrl,
      token
        ? {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        : undefined,
    );

    if (response.status === 403 || response.status === 401) {
      const redirectUrl = new URL("/", request.url);
      redirectUrl.searchParams.set("error", "unauthorized");
      return NextResponse.redirect(redirectUrl);
    }

    if (!response.ok) {
      console.error(
        "CDN response error:",
        response.status,
        response.statusText,
      );
      return new NextResponse(
        `File not found: ${response.status} ${response.statusText}`,
        { status: 404 },
      );
    }

    return new NextResponse(response.body, response);
  } catch (error) {
    console.error("Download error:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
