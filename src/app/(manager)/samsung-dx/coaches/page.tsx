"use client"

import { useState, useEffect, useCallback } from "react"
import {
  SURFACE_CARD_CLASS,
  TABLE_HEADER_CLASS,
  TABLE_ROW_CLASS,
  TABLE_EMPTY_CLASS,
} from "@/components/ui/styles"

interface DxCoach {
  id: string
  name: string
  affiliation: string | null
  dxTag: string | null
  currentMonthAssignments: number
}

const TAG_OPTIONS = ["기본", "심화"] as const

function TagBadge({
  tag,
  onClick,
  disabled,
}: {
  tag: string | null
  onClick?: () => void
  disabled?: boolean
}) {
  const is심화 = tag === "심화"
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`cursor-pointer rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
        is심화
          ? "bg-purple-100 text-purple-700 hover:bg-purple-200"
          : "bg-blue-100 text-blue-700 hover:bg-blue-200"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {tag ?? "기본"}
    </button>
  )
}

export default function DxCoachesPage() {
  const [coaches, setCoaches] = useState<DxCoach[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const fetchCoaches = useCallback(async () => {
    try {
      const res = await fetch("/api/dx-coaches")
      if (res.status === 401) {
        window.location.href = "/login"
        return
      }
      if (!res.ok) {
        setError("코치 목록을 불러오지 못했습니다")
        return
      }
      const data = await res.json()
      setCoaches(data.coaches || [])
    } catch {
      setError("코치 목록을 불러오는 중 오류가 발생했습니다")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCoaches()
  }, [fetchCoaches])

  async function handleToggleTag(coachId: string, currentTag: string | null) {
    const newTag = currentTag === "심화" ? "기본" : "심화"
    setUpdating((prev) => new Set(prev).add(coachId))
    try {
      const res = await fetch(`/api/dx-coaches/${coachId}/tag`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: newTag }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || "태그 변경에 실패했습니다")
        return
      }
      setCoaches((prev) =>
        prev.map((c) => (c.id === coachId ? { ...c, dxTag: newTag } : c)),
      )
    } catch {
      setError("태그 변경 중 오류가 발생했습니다")
    } finally {
      setUpdating((prev) => {
        const next = new Set(prev)
        next.delete(coachId)
        return next
      })
    }
  }

  const 기본Count = coaches.filter((c) => c.dxTag !== "심화").length
  const 심화Count = coaches.filter((c) => c.dxTag === "심화").length

  return (
    <div className="mx-auto max-w-4xl overflow-x-hidden px-4 py-6 sm:px-6">
      <div className="mb-5">
        <h1 className="text-base font-semibold text-[#2F3640]">DX 코치 관리</h1>
        <p className="mt-1 text-xs text-gray-400">
          삼성 DX 코치 목록 및 태그를 관리합니다.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 cursor-pointer text-red-500 underline hover:text-red-700"
          >
            닫기
          </button>
        </div>
      )}

      {/* Summary */}
      <div className="mb-4 flex gap-3">
        <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
          기본 <span className="font-semibold">{기본Count}</span>명
        </div>
        <div className="rounded-lg bg-purple-50 px-3 py-2 text-xs text-purple-700">
          심화 <span className="font-semibold">{심화Count}</span>명
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
          전체 <span className="font-semibold">{coaches.length}</span>명
        </div>
      </div>

      {/* Table */}
      <div className={SURFACE_CARD_CLASS}>
        <div className={`grid grid-cols-[1fr_1fr_100px_80px] ${TABLE_HEADER_CLASS}`}>
          <span>이름</span>
          <span>소속</span>
          <span>태그</span>
          <span className="text-right">이번 달</span>
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <span className="text-sm text-gray-400">불러오는 중...</span>
          </div>
        ) : coaches.length === 0 ? (
          <div className={TABLE_EMPTY_CLASS}>DX 코치가 없습니다</div>
        ) : (
          coaches.map((coach) => (
            <div
              key={coach.id}
              className={`grid grid-cols-[1fr_1fr_100px_80px] ${TABLE_ROW_CLASS}`}
            >
              <span className="text-sm font-medium text-gray-800">
                {coach.name}
              </span>
              <span className="text-sm text-gray-500">
                {coach.affiliation || "-"}
              </span>
              <span>
                <TagBadge
                  tag={coach.dxTag}
                  onClick={() => handleToggleTag(coach.id, coach.dxTag)}
                  disabled={updating.has(coach.id)}
                />
              </span>
              <span className="text-right text-sm tabular-nums text-gray-500">
                {coach.currentMonthAssignments}건
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
