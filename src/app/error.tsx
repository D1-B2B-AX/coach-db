"use client"

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <p className="text-6xl font-bold text-gray-200">500</p>
        <p className="mt-4 text-sm text-gray-500">문제가 발생했습니다</p>
        <button
          onClick={reset}
          className="mt-6 inline-block cursor-pointer rounded-lg bg-[#1976D2] px-4 py-2 text-sm font-medium text-white hover:bg-[#1565C0] transition-colors"
        >
          다시 시도
        </button>
      </div>
    </div>
  )
}
