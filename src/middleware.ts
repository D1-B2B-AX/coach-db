import NextAuth from "next-auth"
import { authConfig } from "@/lib/auth.config"
import { NextResponse } from "next/server"

const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const { pathname } = req.nextUrl

  // Public routes + static files
  if (
    pathname === "/login" ||
    pathname === "/guide" ||
    pathname === "/api/health" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname.match(/\.(png|jpg|jpeg|svg|ico|webp)$/)
  ) {
    return NextResponse.next()
  }

  // Coach routes: token auth (pass through, validated in API/page)
  if (pathname.startsWith("/coach")) {
    return NextResponse.next()
  }

  // Coach API routes: token auth (pass through)
  if (pathname.startsWith("/api/coach/")) {
    return NextResponse.next()
  }

  // Cron/webhook API routes: Bearer token auth (pass through)
  if (pathname.startsWith("/api/sync/") || pathname === "/api/admin/backup") {
    return NextResponse.next()
  }

  // Manager routes: require session
  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
