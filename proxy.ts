import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const origin = new URL(process.env.APP_URL!);
  // Only the configured public host redirects; local health checks stay on HTTP.
  if (
    origin.protocol === "https:" &&
    request.headers.get("host") === origin.host &&
    request.headers.get("x-forwarded-proto") === "http"
  ) {
    const destination = new URL(origin);
    destination.pathname = request.nextUrl.pathname;
    destination.search = request.nextUrl.search;
    return NextResponse.redirect(destination, 308);
  }
  return NextResponse.next();
}
