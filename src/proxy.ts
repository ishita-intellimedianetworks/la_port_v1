import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const HEADSET_UA = /OculusBrowser|Quest|Pico|Wolvic|Firefox Reality|Mobile VR/i;

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (searchParams.has("flat")) return NextResponse.next();
  if (!HEADSET_UA.test(request.headers.get("user-agent") ?? "")) {
    return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  url.pathname = `${pathname.replace(/\/$/, "")}/vr`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/v2", "/v3", "/v4", "/v5"],
};
