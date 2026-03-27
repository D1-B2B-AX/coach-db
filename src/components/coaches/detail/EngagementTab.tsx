"use client"

import { useState, useEffect, useCallback } from "react"
import { useEscClose } from "@/lib/useEscClose"
import { containsProfanity, FEEDBACK_MAX_LENGTH } from "@/lib/profanity"

interface Engagement {
  id: string
  coachId: string
  courseName: string
  status: string
  startDate: string
  endDate: string
  startTime: string | null
  endTime: string | null
  location: string | null
  rating: number | null
  feedback: string | null
  rehire: boolean | null
  hourlyRate: number | null
  workType: string | null
  hiredBy: string | null
  createdAt: string
}

interface EngagementTabProps {
  coachId: string
  currentManagerName?: string // 현재 로그인한 매니저 이름
  isAdmin?: boolean
  openCreate?: boolean
  onCreateOpened?: () => void
}

const STATUS_CONFIG: Record<string, { label: string; className: string; borderClass: string }> = {
  scheduled: { label: "예정", className: "bg-[#E3F2FD] text-[#1976D2]", borderClass: "border-l-[#1976D2]" },
  in_progress: { label: "진행중", className: "bg-[#FFF8E1] text-[#F57F17]", borderClass: "border-l-[#F57F17]" },
  completed: { label: "완료", className: "bg-gray-100 text-gray-500", borderClass: "border-l-gray-300" },
  cancelled: { label: "취소", className: "bg-[#FBE9E7] text-[#D84315]", borderClass: "border-l-[#D84315]" },
}

const STATUS_OPTIONS = [
  { value: "scheduled", label: "예정" },
  { value: "in_progress", label: "진행중" },
  { value: "completed", label: "완료" },
  { value: "cancelled", label: "취소" },
]

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"]
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}(${dayNames[d.getDay()]})`
}

function renderStars(rating: number | null) {
  if (rating === null) return <span className="text-gray-300">-</span>
  return (
    <span className="text-[#F57F17]">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i}>{i < rating ? "\u2605" : "\u2606"}</span>
      ))}
    </span>
  )
}

interface EngagementFormData {
  courseName: string
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  location: string
  status: string
  rating: string
  feedback: string
  rehire: string // "true" | "false" | ""
  hiredBy: string
}

const emptyForm: EngagementFormData = {
  courseName: "",
  startDate: "",
  endDate: "",
  startTime: "",
  endTime: "",
  location: "",
  status: "scheduled",
  rating: "",
  feedback: "",
  rehire: "",
  hiredBy: "",
}

export default function EngagementTab({ coachId, currentManagerName, isAdmin, openCreate, onCreateOpened }: EngagementTabProps) {
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<EngagementFormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  useEscClose(showModal, () => setShowModal(false))

  const fetchEngagements = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/coaches/${coachId}/engagements`)
      if (res.ok) {
        const data = await res.json()
        setEngagements(data.engagements || [])
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [coachId])

  useEffect(() => {
    fetchEngagements()
  }, [fetchEngagements])

  useEffect(() => {
    if (openCreate && !showModal) {
      openCreateModal()
      onCreateOpened?.()
    }
  }, [openCreate])

  function openCreateModal() {
    setEditingId(null)
    setForm({ ...emptyForm, hiredBy: currentManagerName || "" })
    setError("")
    setShowModal(true)
  }

  function openEditModal(eng: Engagement) {
    setEditingId(eng.id)
    setForm({
      courseName: eng.courseName,
      startDate: eng.startDate.slice(0, 10),
      endDate: eng.endDate.slice(0, 10),
      startTime: eng.startTime || "",
      endTime: eng.endTime || "",
      location: eng.location || "",
      status: eng.status,
      rating: eng.rating !== null ? String(eng.rating) : "",
      feedback: eng.feedback || "",
      rehire: eng.rehire === true ? "true" : eng.rehire === false ? "false" : "",
      hiredBy: eng.hiredBy || "",
    })
    setError("")
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.courseName.trim()) {
      setError("코스명을 입력해주세요.")
      return
    }
    if (!form.startDate || !form.endDate) {
      setError("기간을 입력해주세요.")
      return
    }
    if (!form.hiredBy.trim()) {
      setError("담당자를 입력해주세요.")
      return
    }
    if (containsProfanity(form.feedback)) {
      setError("피드백에 부적절한 표현이 포함되어 있습니다.")
      return
    }

    setSaving(true)
    setError("")

    const payload = {
      courseName: form.courseName.trim(),
      startDate: form.startDate,
      endDate: form.endDate,
      startTime: form.startTime || null,
      endTime: form.endTime || null,
      location: form.location || null,
      status: form.status,
      rating: form.rating ? parseInt(form.rating, 10) : null,
      feedback: form.feedback || null,
      rehire: form.rehire === "true" ? true : form.rehire === "false" ? false : null,
      hiredBy: form.hiredBy.trim(),
    }

    try {
      let res: Response
      if (editingId) {
        res = await fetch(`/api/engagements/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch(`/api/coaches/${coachId}/engagements`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      }

      if (res.ok) {
        setShowModal(false)
        fetchEngagements()
      } else {
        const data = await res.json()
        setError(data.error || "저장에 실패했습니다.")
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.")
    } finally {
      setSaving(false)
    }
  }

  function updateForm(field: keyof EngagementFormData, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-4 w-24 animate-pulse rounded bg-gray-100" />
          <div className="h-9 w-24 animate-pulse rounded-xl bg-gray-100" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100 space-y-2">
            <div className="h-4 w-48 animate-pulse rounded bg-gray-100" />
            <div className="h-3 w-32 animate-pulse rounded bg-gray-100" />
          </div>
        ))}
      </div>
    )
  }

  // 같은 과정명 그룹핑 (삼성 SW학부 등)
  const grouped = (() => {
    const groups: { key: string; items: Engagement[]; merged: boolean }[] = []
    const seen = new Map<string, number>() // courseName → group index
    for (const eng of engagements) {
      const existing = seen.get(eng.courseName)
      if (existing !== undefined) {
        groups[existing].items.push(eng)
        groups[existing].merged = true
      } else {
        seen.set(eng.courseName, groups.length)
        groups.push({ key: eng.id, items: [eng], merged: false })
      }
    }
    return groups
  })()

  return (
    <div className="space-y-4">

      {engagements.length === 0 ? (
        <div className="rounded-2xl bg-white px-5 py-12 text-center text-sm text-gray-400 shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100">
          등록된 투입 이력이 없습니다
        </div>
      ) : (
        <div className="space-y-2">
          {grouped.map((group) => {
            const first = group.items[0]
            const last = group.items[group.items.length - 1]
            const displayStart = group.merged ? group.items.reduce((min, e) => e.startDate < min ? e.startDate : min, first.startDate) : first.startDate
            const displayEnd = group.merged ? group.items.reduce((max, e) => e.endDate > max ? e.endDate : max, first.endDate) : first.endDate
            // 그룹 상태: in_progress > scheduled > completed
            const groupStatus = group.merged
              ? (group.items.some(e => e.status === 'in_progress') ? 'in_progress'
                : group.items.some(e => e.status === 'scheduled') ? 'scheduled' : first.status)
              : first.status
            const statusCfg = STATUS_CONFIG[groupStatus] || STATUS_CONFIG.scheduled
            const canEdit = isAdmin || (currentManagerName && first.hiredBy === currentManagerName)
            const isExpanded = expandedIds.has(group.key)

            return (
              <div
                key={group.key}
                className={`rounded-lg bg-white border border-gray-100 border-l-[3px] ${statusCfg.borderClass}`}
              >
                {/* 한 줄 요약 */}
                <div
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                  onClick={() => setExpandedIds(prev => { const next = new Set(prev); if (next.has(group.key)) next.delete(group.key); else next.add(group.key); return next })}
                >
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${statusCfg.className}`}>
                    {statusCfg.label}
                  </span>
                  <span className="shrink-0 text-xs text-gray-400">
                    {group.merged
                      ? `${new Date(displayStart).getFullYear()}.${new Date(displayStart).getMonth() + 1}~${new Date(displayEnd).getFullYear()}.${new Date(displayEnd).getMonth() + 1}`
                      : `${formatDate(displayStart)}~${formatDate(displayEnd)}`
                    }
                  </span>
                  <span className="text-sm text-[#333] truncate flex-1">{first.courseName}</span>
                  <svg className={`shrink-0 h-3 w-3 text-gray-300 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* 상세 펼침 */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-3 py-2.5 text-sm space-y-2">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      {first.workType && <span><span className="text-gray-400">유형</span> <span className="text-[#333]">{first.workType}</span></span>}
                      <span><span className="text-gray-400">시급</span> <span className={first.hourlyRate ? "text-[#333]" : "text-gray-300"}>{first.hourlyRate ? `${first.hourlyRate.toLocaleString()}원` : "-"}</span></span>
                      <span><span className="text-gray-400">담당</span> <span className="text-[#333]">{first.hiredBy || "-"}</span></span>
                      <span><span className="text-gray-400">평가</span> <span className={first.rating !== null ? "text-[#F57F17]" : "text-gray-300"}>{first.rating !== null ? `★ ${first.rating}` : "-"}</span></span>
                      <span className="flex items-center gap-1"><span className="text-gray-400">재섭외</span> {first.rehire !== null ? (
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${first.rehire ? "bg-[#E8F5E9] text-[#2E7D32]" : "bg-[#FBE9E7] text-[#D84315]"}`}>
                          {first.rehire ? "희망" : "비희망"}
                        </span>
                      ) : <span className="text-gray-300">-</span>}</span>
                      {(isAdmin || (currentManagerName && first.hiredBy === currentManagerName)) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditModal(first) }}
                          className="rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-[#1976D2] hover:bg-[#E3F2FD] transition-colors"
                        >
                          수정
                        </button>
                      )}
                    </div>
                    {first.feedback && (
                      <div>
                        <span className="text-gray-400">피드백</span>{" "}
                        <span className="text-[#333] whitespace-pre-wrap">{first.feedback}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <form onSubmit={handleSubmit}>
              <div className="border-b border-gray-100 px-6 py-4">
                <h4 className="text-sm font-semibold text-[#333]">
                  {editingId ? "이력 수정" : "이력 등록"}
                </h4>
              </div>

              <div className="max-h-[60vh] space-y-4 overflow-y-auto px-6 py-4">
                {error && (
                  <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                )}

                {/* Course name */}
                <div>
                  <label className="block text-sm font-semibold text-[#333] mb-1.5">코스명 *</label>
                  <input
                    type="text"
                    value={form.courseName}
                    onChange={(e) => updateForm("courseName", e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:border-[#1976D2]"
                  />
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-[#333] mb-1.5">시작일 *</label>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => updateForm("startDate", e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:border-[#1976D2]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#333] mb-1.5">종료일 *</label>
                    <input
                      type="date"
                      value={form.endDate}
                      onChange={(e) => updateForm("endDate", e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:border-[#1976D2]"
                    />
                  </div>
                </div>

                {/* Times */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-[#333] mb-1.5">시작 시간</label>
                    <input
                      type="time"
                      value={form.startTime}
                      onChange={(e) => updateForm("startTime", e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:border-[#1976D2]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#333] mb-1.5">종료 시간</label>
                    <input
                      type="time"
                      value={form.endTime}
                      onChange={(e) => updateForm("endTime", e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:border-[#1976D2]"
                    />
                  </div>
                </div>

                {/* Location */}
                <div>
                  <label className="block text-sm font-semibold text-[#333] mb-1.5">장소</label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => updateForm("location", e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:border-[#1976D2]"
                  />
                </div>

                {/* Status */}
                <div>
                  <label className="block text-sm font-semibold text-[#333] mb-1.5">상태</label>
                  <select
                    value={form.status}
                    onChange={(e) => updateForm("status", e.target.value)}
                    className="w-full appearance-none cursor-pointer rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 pr-8 text-base font-medium text-gray-700 focus:outline-none focus:border-[#1976D2] bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%239CA3AF%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_0.75rem_center] bg-[length:1rem]"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Rating */}
                <div>
                  <label className="block text-sm font-semibold text-[#333] mb-1.5">평점 (1-5)</label>
                  <select
                    value={form.rating}
                    onChange={(e) => updateForm("rating", e.target.value)}
                    className="w-full appearance-none cursor-pointer rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 pr-8 text-base font-medium text-gray-700 focus:outline-none focus:border-[#1976D2] bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%239CA3AF%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_0.75rem_center] bg-[length:1rem]"
                  >
                    <option value="">미평가</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={String(n)}>
                        {n}점
                      </option>
                    ))}
                  </select>
                </div>

                {/* Feedback */}
                <div>
                  <label className="block text-sm font-semibold text-[#333] mb-1.5">피드백</label>
                  <textarea
                    value={form.feedback}
                    onChange={(e) => {
                      if (e.target.value.length <= FEEDBACK_MAX_LENGTH) {
                        updateForm("feedback", e.target.value)
                      }
                    }}
                    maxLength={FEEDBACK_MAX_LENGTH}
                    rows={3}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:border-[#1976D2]"
                  />
                  <div className="mt-1 flex justify-between text-xs">
                    {containsProfanity(form.feedback) ? (
                      <span className="text-red-500">부적절한 표현이 포함되어 있습니다</span>
                    ) : <span />}
                    <span className={`${form.feedback.length >= FEEDBACK_MAX_LENGTH ? "text-red-500" : "text-gray-400"}`}>
                      {form.feedback.length}/{FEEDBACK_MAX_LENGTH}
                    </span>
                  </div>
                </div>

                {/* Rehire */}
                <div>
                  <label className="block text-sm font-semibold text-[#333] mb-1.5">재섭외 의사</label>
                  <select
                    value={form.rehire}
                    onChange={(e) => updateForm("rehire", e.target.value)}
                    className="w-full appearance-none cursor-pointer rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 pr-8 text-base font-medium text-gray-700 focus:outline-none focus:border-[#1976D2] bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%239CA3AF%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_0.75rem_center] bg-[length:1rem]"
                  >
                    <option value="">미입력</option>
                    <option value="true">희망</option>
                    <option value="false">비희망</option>
                  </select>
                </div>

                {/* Hired by */}
                <div>
                  <label className="block text-sm font-semibold text-[#333] mb-1.5">담당자 *</label>
                  <input
                    type="text"
                    value={form.hiredBy}
                    onChange={(e) => updateForm("hiredBy", e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:border-[#1976D2]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[#1976D2] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1565C0] disabled:opacity-50 transition-colors"
                >
                  {saving ? "저장 중..." : "저장"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
