"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import CoachForm from "@/components/coaches/CoachForm"
import type { CoachFormData } from "@/components/coaches/CoachForm"

export default function NewCoachPage() {
  const router = useRouter()
  const [successData, setSuccessData] = useState<{
    coachId: string
    accessToken: string
    coachLink: string
  } | null>(null)

  async function handleSubmit(data: CoachFormData) {
    const res = await fetch("/api/coaches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || "코치 등록에 실패했습니다.")
    }

    const created = await res.json()
    const coachLink = `${window.location.origin}/coach?token=${created.accessToken}`

    setSuccessData({
      coachId: created.id,
      accessToken: created.accessToken,
      coachLink,
    })
  }

  // Success dialog
  if (successData) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-lg bg-white p-8 shadow-sm">
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="mt-4 text-lg font-semibold text-gray-900">코치 등록 완료</h2>
            <p className="mt-1 text-sm text-gray-500">코치가 성공적으로 등록되었습니다.</p>
          </div>

          <div className="mt-6 space-y-4">
            {/* Coach link */}
            <div>
              <label className="block text-sm font-medium text-gray-700">코치 고유 링크</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={successData.coachLink}
                  className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600"
                />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(successData.coachLink)
                    } catch {
                      // fallback
                    }
                  }}
                  className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  복사
                </button>
                <button
                  type="button"
                  onClick={() => window.open(`${successData.coachLink}&viewer=manager`, '_blank')}
                  className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-[#1976D2] hover:bg-gray-50 transition-colors"
                >
                  들어가기
                </button>
              </div>
              <p className="mt-1 text-sm text-gray-400">
                이 링크로 코치가 스케줄을 입력할 수 있습니다.
              </p>
            </div>

          </div>

          <div className="mt-6 flex justify-center gap-3">
            <Link
              href={`/coaches/${successData.coachId}`}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
            >
              코치 상세 보기
            </Link>
            <Link
              href="/coaches"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              목록으로
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/coaches"
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          &larr;
        </Link>
        <h1 className="text-lg font-bold text-[#333]">코치 등록</h1>
      </div>

      <div className="mt-6">
        <CoachForm onSubmit={handleSubmit} />
      </div>
    </div>
  )
}
