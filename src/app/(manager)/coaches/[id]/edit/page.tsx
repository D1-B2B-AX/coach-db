"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import CoachForm from "@/components/coaches/CoachForm"
import type { CoachDetail, CoachFormData } from "@/components/coaches/CoachForm"
import { Skeleton, SkeletonCard } from "@/components/Skeleton"

export default function EditCoachPage() {
  const params = useParams()
  const router = useRouter()
  const coachId = params.id as string

  const [coach, setCoach] = useState<CoachDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState("")
  const [submitting, setSubmitting] = useState(false)

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

  function hasChanges(original: CoachDetail, data: CoachFormData): boolean {
    if (original.name !== data.name) return true
    const origBirth = original.birthDate ? original.birthDate.slice(0, 10) : null
    if (origBirth !== data.birthDate) return true
    if ((original.phone ?? null) !== data.phone) return true
    if ((original.email ?? null) !== data.email) return true
    if ((original.affiliation ?? null) !== data.affiliation) return true
    if ((original.workType ?? null) !== data.workType) return true
    if ((original.selfNote ?? null) !== data.selfNote) return true
    if ((original.managerNote ?? null) !== data.managerNote) return true
    const origFields = original.fields.map((f) => f.name).sort()
    const newFields = [...data.fields].sort()
    if (origFields.length !== newFields.length || origFields.some((f, i) => f !== newFields[i])) return true
    const origCurr = original.curriculums.map((c) => c.name).sort()
    const newCurr = [...data.curriculums].sort()
    if (origCurr.length !== newCurr.length || origCurr.some((c, i) => c !== newCurr[i])) return true
    return false
  }

  async function handleSubmit(data: CoachFormData) {
    if (coach && !hasChanges(coach, data)) {
      router.push(`/coaches/${coachId}`)
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/coaches/${coachId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || "수정에 실패했습니다.")
      }

      router.push(`/coaches/${coachId}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5" />
            <Skeleton className="h-6 w-28" />
          </div>
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
        <div className="mt-6 space-y-6">
          <SkeletonCard>
            <Skeleton className="h-4 w-20 mb-4" />
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-10 w-full rounded-xl" />
                </div>
              ))}
            </div>
          </SkeletonCard>
          <SkeletonCard>
            <Skeleton className="h-4 w-36 mb-4" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </SkeletonCard>
        </div>
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
          disabled={submitting}
          className="cursor-pointer rounded-lg bg-[#1976D2] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#1565C0] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "저장 중..." : "수정 확인"}
        </button>
      </div>

      <div className="mt-6">
        <CoachForm initialData={coach} onSubmit={handleSubmit} isEdit formId="coach-edit-form" />
      </div>
    </div>
  )
}
