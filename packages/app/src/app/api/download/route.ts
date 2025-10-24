import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get("path");

    if (!path) {
      return new NextResponse("Path parameter is required", { status: 400 });
    }

    // CDNからファイルを取得
    const cdnUrl = `${process.env.NEXT_PUBLIC_CDN_ORIGIN}/${path}`;

    // リファラヘッダーを設定（CDNの設定に合わせる）
    const referer = request.headers.get("referer");

    const response = await fetch(
      cdnUrl,
      referer
        ? {
            headers: {
              Referer: referer,
            },
          }
        : undefined,
    );

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
