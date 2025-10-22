import { NextResponse } from "next/server";
import { auth } from "./auth";

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

export default auth((req) => {
  const url = new URL(req.url);
  if (!req.auth && !["/", "/forbidden"].includes(url.pathname)) {
    const redirectUrl = new URL("/", req.url);
    redirectUrl.searchParams.set("error", "unauthorized");
    return NextResponse.redirect(redirectUrl);
  }
});
