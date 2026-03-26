"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import CoachForm from "@/components/coaches/CoachForm"
import type { CoachDetail, CoachFormData } from "@/components/coaches/CoachForm"

export default function EditCoachPage() {
  const params = useParams()
  const router = useRouter()
  const coachId = params.id as string

  const [coach, setCoach] = useState<CoachDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState("")

  const fetchCoach = useCallback(async () => {
    setLoading(true)
    setFetchError("")
    try {
      const res = await fetch(`/api/coaches/${coachId}`)
      if (res.ok) {
        const data = await res.json()
        setCoach(data)
      } else if (res.status === 404) {
        setFetchError("코치를 찾을 수 없습니다.")
      } else {
        setFetchError("데이터를 불러오는데 실패했습니다.")
      }
    } catch {
      setFetchError("네트워크 오류가 발생했습니다.")
    } finally {
      setLoading(false)
    }
  }, [coachId])

  useEffect(() => {
    fetchCoach()
  }, [fetchCoach])

  async function handleSubmit(data: CoachFormData) {
    const res = await fetch(`/api/coaches/${coachId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })

    // 변경 없어도 그냥 상세로 돌아감
    if (!res.ok && res.status !== 400) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || "수정에 실패했습니다.")
    }

    router.push(`/coaches/${coachId}`)
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="py-12 text-center text-sm text-gray-400">불러오는 중...</div>
      </div>
    )
  }

  if (fetchError || !coach) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="py-12 text-center">
          <p className="text-sm text-gray-400">{fetchError || "코치를 찾을 수 없습니다."}</p>
          <Link
            href="/coaches"
            className="mt-4 inline-block text-sm text-blue-600 hover:text-blue-800"
          >
            목록으로 돌아가기
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/coaches/${coachId}`}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            &larr;
          </Link>
          <h1 className="text-lg font-bold text-[#333]">{coach.name}</h1>
        </div>
        <button
          type="submit"
          form="coach-edit-form"
          className="cursor-pointer rounded-lg bg-[#1976D2] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#1565C0] transition-colors"
        >
          수정 확인
        </button>
      </div>

      <div className="mt-6">
        <CoachForm initialData={coach} onSubmit={handleSubmit} isEdit formId="coach-edit-form" />
      </div>
    </div>
  )
}
