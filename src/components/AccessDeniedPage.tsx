"use client"

import Link from "next/link"

interface AccessDeniedPageProps {
  title?: string
  message?: string
  actionLabel?: string
  actionHref?: string
}

export default function AccessDeniedPage({
  title = "403 Access Denied",
  message = "이 페이지를 볼 권한이 없습니다.",
  actionLabel = "Return to Dashboard",
  actionHref = "/dashboard",
}: AccessDeniedPageProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#f8fbff_0%,_#f4f7fb_38%,_#eef3f9_100%)] px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-white/70 bg-white/90 p-8 text-center shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#FFF3E0] text-[#E65100]">
          <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M4.93 19h14.14A2 2 0 0021 16.07L13.07 4.93a2 2 0 00-3.14 0L3 16.07A2 2 0 004.93 19z" />
          </svg>
        </div>
        <p className="mt-5 text-sm font-semibold uppercase tracking-[0.24em] text-[#90A4AE]">
          Access Restricted
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#1F2937]">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#607080]">
          {message}
        </p>
        <Link
          href={actionHref}
          className="mt-7 inline-flex w-full items-center justify-center rounded-xl bg-[#1976D2] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1565C0]"
        >
          {actionLabel}
        </Link>
      </div>
    </div>
  )
}
