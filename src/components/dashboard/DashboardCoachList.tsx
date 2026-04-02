"use client"

import { useMemo, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Skeleton } from "@/components/Skeleton"
import type { CourseOption } from "@/components/CourseSelector"

interface CoachSchedule {
  startTime: string
  endTime: string
}

interface CoachEntry {
  id: string
  name: string
  phone?: string | null
  email?: string | null
  schedules: CoachSchedule[]
  fields: string[]
  avgRating: number | null
  latestEngagement?: { courseName: string; endDate: string } | null
  recentEngagements?: { courseName: string; endDate: string }[]
  engagementCount?: number
  workDays?: number
}

interface DashboardCoachListProps {
  selectedDate: string | null
  selectedEnd?: string | null
  coaches: CoachEntry[]
  loading: boolean
  timeFilter: string
  onTimeFilterChange: (filter: string) => void
  fieldFilter: string
  onFieldFilterChange: (filter: string) => void
  ratingFilter: string
  onRatingFilterChange: (filter: string) => void
  statusFilter: string
  onStatusFilterChange: (filter: string) => void
  engagementFilter: string
  onEngagementFilterChange: (filter: string) => void
  scoutedCoachIds?: Set<string>
  onBulkScout?: (coachIds: string[]) => void
  courses?: CourseOption[]
  selectedCourseId?: string | null
  onCourseChange?: (courseId: string | null) => void
  onCourseCreate?: (course: CourseOption) => void
  onReset?: () => void
}

const RATING_FILTERS = [
  { key: "all", label: "평가 전체" },
  { key: "4+", label: "4점 이상" },
  { key: "3+", label: "3점 이상" },
  { key: "new", label: "신규 (미평가)" },
]

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"]
  const m = d.getMonth() + 1
  const day = d.getDate()
  const dow = dayNames[d.getDay()]
  return `${m}/${day} (${dow})`
}

function formatScheduleLabel(schedules: CoachSchedule[]): string {
  if (schedules.length === 0) return "-"
  // Merge all schedules to find overall earliest start and latest end
  let minStart = 24
  let maxEnd = 0
  for (const s of schedules) {
    const sh = parseInt(s.startTime.slice(0, 2), 10)
    const eh = parseInt(s.endTime.slice(0, 2), 10)
    if (sh < minStart) minStart = sh
    if (eh > maxEnd) maxEnd = eh
  }
  if (minStart < 13 && maxEnd <= 13) return "오전"
  if (minStart >= 13 && maxEnd <= 18) return "오후"
  if (minStart >= 18) return "저녁"
  if (minStart < 13 && maxEnd > 13 && maxEnd <= 18) return "오전·오후"
  if (minStart < 13 && maxEnd > 18) return "전일"
  if (minStart >= 13 && maxEnd > 18) return "오후·저녁"
  return "오전"
}

function formatEngagement(eng: { courseName: string; endDate: string } | null): string {
  if (!eng) return "-"
  const d = new Date(eng.endDate)
  // 접두사 정리: [부가세 별도], [부가세별도], (B2B), 언더스코어 → 공백
  const clean = eng.courseName
    .replace(/\[부가세\s*별도\]\s*/g, "")
    .replace(/\(B2B\)\s*/g, "")
    .replace(/_/g, " ")
    .trim()
  return `${clean} (${d.getMonth() + 1}월)`
}

function downloadExcel(rows: string[][], fileName: string) {
  // Simple CSV with BOM for Excel Korean support
  const bom = "\uFEFF"
  const csv = rows.map((r) => r.join(",")).join("\n")
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

export default function DashboardCoachList({
  selectedDate,
  selectedEnd,
  coaches,
  loading,
  timeFilter,
  onTimeFilterChange,
  fieldFilter,
  onFieldFilterChange,
  ratingFilter,
  onRatingFilterChange,
  engagementFilter,
  onEngagementFilterChange,
  scoutedCoachIds,
  onBulkScout,
  courses,
  selectedCourseId,
  onCourseChange,
  onCourseCreate,
  onReset,
}: DashboardCoachListProps) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showCourseModal, setShowCourseModal] = useState(false)
  const [newCourseName, setNewCourseName] = useState("")
  const [newStartDate, setNewStartDate] = useState("")
  const [newEndDate, setNewEndDate] = useState("")
  const [courseError, setCourseError] = useState("")
  const [courseSaving, setCourseSaving] = useState(false)

  const allFields = useMemo(() => {
    const set = new Set<string>()
    for (const c of coaches) for (const f of c.fields) set.add(f)
    return [...set].sort()
  }, [coaches])

  // Check if a coach's schedule overlaps with a time range
  function hasTimeOverlap(schedules: CoachSchedule[], startTime: string, endTime: string): boolean {
    return schedules.some((s) => s.startTime < endTime && s.endTime > startTime)
  }

  const filteredCoaches = useMemo(() => {
    return coaches.filter((c) => {
      // Time filter
      if (timeFilter !== "all") {
        const [s, e] = timeFilter.split("-")
        if (!hasTimeOverlap(c.schedules, `${s}:00`, `${e}:00`)) return false
      }
      // Field filter (multi)
      if (fieldFilter !== "all") {
        const selectedFields = fieldFilter.split(",")
        if (!selectedFields.some(f => c.fields.includes(f))) return false
      }
      // Rating filter (multi — comma separated)
      if (ratingFilter !== "all") {
        const filters = ratingFilter.split(",")
        const match = filters.some(f => {
          if (f === "4+" && c.avgRating !== null && c.avgRating >= 4) return true
          if (f === "3+" && c.avgRating !== null && c.avgRating >= 3) return true
          if (f === "new" && c.avgRating === null) return true
          return false
        })
        if (!match) return false
      }
      // Engagement filter
      if (engagementFilter && engagementFilter !== "all") {
        const count = c.engagementCount ?? 0
        if (engagementFilter === "0") { if (count !== 0) return false }
        else { if (count < parseInt(engagementFilter)) return false }
      }
      return true
    })
  }, [coaches, timeFilter, fieldFilter, ratingFilter, engagementFilter])

  const toggleId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === filteredCoaches.length) return new Set()
      return new Set(filteredCoaches.map((c) => c.id))
    })
  }, [filteredCoaches])

  const selectedCoaches = filteredCoaches.filter((c) => selectedIds.has(c.id))

  const handleExport = useCallback(() => {
    const rows = [["이름", "핸드폰", "이메일"], ...selectedCoaches.map((c) => [c.name, c.phone || "", c.email || ""])]
    const suffix = selectedEnd ? `${selectedDate}_${selectedEnd}` : selectedDate
    downloadExcel(rows, `코치_${suffix}.csv`)
  }, [selectedCoaches, selectedDate, selectedEnd])

  if (!selectedDate) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center text-sm text-gray-400 shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100">
        날짜를 선택하면 가능한 코치 목록이 표시됩니다
      </div>
    )
  }

  // Filter summary — natural sentence with highlights
  const summaryNode = (() => {
    if (!selectedDate) return null
    const d = new Date(selectedDate + "T00:00:00")
    const dayNames = ["일", "월", "화", "수", "목", "금", "토"]

    let datePart: string
    if (selectedEnd) {
      const d2 = new Date(selectedEnd + "T00:00:00")
      datePart = `${d.getMonth() + 1}월 ${d.getDate()}일(${dayNames[d.getDay()]})~${d2.getMonth() + 1}월 ${d2.getDate()}일(${dayNames[d2.getDay()]})`
    } else {
      datePart = `${d.getMonth() + 1}월 ${d.getDate()}일 ${dayNames[d.getDay()]}요일`
    }

    let timePart = ""
    if (timeFilter !== "all") {
      const presetLabels: Record<string, string> = { "08-13": "오전", "13-18": "오후", "18-22": "저녁" }
      timePart = presetLabels[timeFilter] || (() => { const [s, e] = timeFilter.split("-"); return `${s}:00~${e}:00` })()
    }

    return (
      <span className="text-sm text-gray-400">
        <span className="font-medium text-[#333]">{datePart}</span>
        {timePart && <>{" "}<span className="font-medium text-[#1976D2]">{timePart}</span></>}
        에 근무 가능한 코치는 <span className="font-medium text-[#1976D2]">{filteredCoaches.length}명</span>입니다.
      </span>
    )
  })()

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100">
      {/* Filter summary + course selector */}
      {selectedDate && (
        <div className="border-b border-gray-100 px-5 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {summaryNode}
            {selectedIds.size > 0 && onBulkScout && (
              <button
                onClick={() => onBulkScout([...selectedIds])}
                className="cursor-pointer shrink-0 rounded-full bg-[#F57C00] px-3 py-1 text-[11px] font-medium text-white hover:bg-[#E65100] transition-colors"
              >
                컨택중 ({selectedIds.size})
              </button>
            )}
            {onReset && (
              <button
                onClick={onReset}
                className="cursor-pointer shrink-0 rounded-full border border-gray-200 bg-white px-2 py-1 text-[10px] text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
              >
                초기화
              </button>
            )}
          </div>
          {courses && onCourseChange && (
            <div className="flex items-center gap-1.5 shrink-0">
              <select
                value={selectedCourseId ?? ""}
                onChange={(e) => onCourseChange(e.target.value || null)}
                className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
              >
                <option value="">과정 선택</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {onCourseCreate && (
                <button
                  onClick={() => { setNewStartDate(selectedDate || ""); setNewEndDate(selectedEnd || ""); setShowCourseModal(true) }}
                  className="cursor-pointer shrink-0 rounded-lg border border-dashed border-gray-300 px-2 py-1 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600"
                >
                  + 추가
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {/* Coach rows */}
      <div>
        {loading ? (
          <div>
            <div className="grid grid-cols-[auto_minmax(0,120px)_80px_minmax(0,1fr)_64px_36px] items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2 text-[11px] font-semibold text-gray-400">
              <div className="w-4" /><div>이름</div><div>가능 시간대</div><div>최근 근무 과정명</div><div className="whitespace-nowrap">누적 근무일</div><div>평점</div>
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[auto_minmax(0,120px)_80px_minmax(0,1fr)_64px_36px] items-center gap-2 px-4 py-2.5 border-b border-gray-100">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-8 mx-auto" />
                <Skeleton className="h-4 w-6 mx-auto" />
              </div>
            ))}
          </div>
        ) : filteredCoaches.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">해당 조건에 맞는 코치가 없습니다</div>
        ) : (
          <>
            {/* Table header */}
            <div className="grid grid-cols-[auto_minmax(0,120px)_80px_minmax(0,1fr)_64px_36px] items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2 text-[11px] font-semibold text-gray-400">
              <div className="w-4 flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={selectedIds.size === filteredCoaches.length && filteredCoaches.length > 0}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-gray-300 accent-[#1976D2]"
                />
              </div>
              <div>이름</div>
              <div>가능 시간대</div>
              <div>최근 근무 과정명</div>
              <div className="whitespace-nowrap">누적 근무일</div>
              <div>평점</div>
            </div>
            {filteredCoaches.map((coach) => {
              const latest = coach.recentEngagements?.[0] || coach.latestEngagement
              const courseName = latest
                ? latest.courseName.replace(/\[부가세\s*별도\]\s*/g, "").replace(/\(B2B\)\s*/g, "").replace(/_/g, " ").trim()
                : null
              return (
                <div
                  key={coach.id}
                  onClick={() => router.push(`/coaches/${coach.id}`)}
                  className={`grid grid-cols-[auto_minmax(0,120px)_80px_minmax(0,1fr)_64px_36px] items-center gap-2 px-4 py-2.5 border-b border-gray-100 transition-colors hover:bg-gray-50 cursor-pointer ${
                    selectedIds.has(coach.id) ? "bg-[#E3F2FD]/50" : ""
                  }`}
                >
                  <div className="w-4 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(coach.id)}
                      onChange={() => toggleId(coach.id)}
                      className="h-4 w-4 rounded border-gray-300 accent-[#1976D2]"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm font-medium text-[#333] truncate">{coach.name}</span>
                    {scoutedCoachIds?.has(coach.id) && (
                      <span className="shrink-0 rounded-full bg-[#FFF3E0] px-1.5 py-0.5 text-[10px] font-semibold text-[#E65100] border border-[#FFB74D]">
                        컨택중
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 truncate">
                    {formatScheduleLabel(coach.schedules)}
                  </span>
                  <span className="text-xs text-gray-400 truncate">
                    {courseName || "-"}
                  </span>
                  <span className="text-xs text-gray-500">
                    {(coach.workDays ?? 0) > 0 ? `${coach.workDays}일` : "-"}
                  </span>
                  <span className="text-xs">
                    {coach.avgRating !== null ? <span className="text-[#F57F17]">{coach.avgRating.toFixed(1)}</span> : <span className="text-gray-300">-</span>}
                  </span>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* 과정 추가 팝업 */}
      {showCourseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowCourseModal(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-[#333] mb-3">새 과정 추가</h3>
            {courseError && <div className="mb-2 text-xs text-red-600">{courseError}</div>}
            <input
              type="text"
              placeholder="과정명을 입력하세요"
              maxLength={200}
              autoFocus
              value={newCourseName}
              onChange={(e) => setNewCourseName(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setShowCourseModal(false)}
              className={`mb-2 w-full rounded-lg border px-3 py-2 text-sm ${!newCourseName.trim() && courseError ? "border-red-400" : "border-gray-300"} focus:border-blue-400 focus:outline-none`}
            />
            <div className="mb-3 flex gap-2">
              <input type="date" value={newStartDate} onChange={(e) => setNewStartDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm focus:border-blue-400 focus:outline-none" />
              <input type="date" value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm focus:border-blue-400 focus:outline-none" />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowCourseModal(false); setCourseError("") }}
                className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100">취소</button>
              <button
                disabled={courseSaving}
                onClick={async () => {
                  setCourseError("")
                  if (!newCourseName.trim()) { setCourseError("과정명을 입력해주세요"); return }
                  if (newEndDate && !newStartDate) { setCourseError("시작일 없이 종료일만 입력할 수 없습니다"); return }
                  if (newStartDate && newEndDate && newEndDate < newStartDate) { setCourseError("종료일은 시작일 이후여야 합니다"); return }
                  setCourseSaving(true)
                  try {
                    const res = await fetch("/api/courses", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name: newCourseName.trim(), startDate: newStartDate || undefined, endDate: newEndDate || undefined }),
                    })
                    if (res.ok) {
                      const course = await res.json()
                      onCourseCreate?.({ id: course.id, name: course.name, startDate: course.startDate, endDate: course.endDate })
                      onCourseChange?.(course.id)
                      setShowCourseModal(false)
                      setNewCourseName(""); setNewStartDate(""); setNewEndDate("")
                    } else {
                      const data = await res.json().catch(() => ({}))
                      setCourseError(data.error || "과정 생성에 실패했습니다")
                    }
                  } catch { setCourseError("과정 생성에 실패했습니다") }
                  finally { setCourseSaving(false) }
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >{courseSaving ? "추가 중..." : "추가"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Field Multi-Select Dropdown ───

function FieldDropdown({
  allFields,
  fieldFilter,
  onFieldFilterChange,
}: {
  allFields: string[]
  fieldFilter: string
  onFieldFilterChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = fieldFilter === "all" ? [] : fieldFilter.split(",")
  const count = selected.length

  function toggle(f: string) {
    if (selected.includes(f)) {
      const next = selected.filter(x => x !== f)
      onFieldFilterChange(next.length > 0 ? next.join(",") : "all")
    } else {
      onFieldFilterChange([...selected, f].join(","))
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`cursor-pointer rounded-full border px-2 py-1 text-[11px] font-medium transition-colors ${
          count > 0
            ? "border-[#1976D2] bg-[#E3F2FD] text-[#1976D2]"
            : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
        }`}
      >
        분야{count > 0 ? ` (${count})` : ""} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
            {allFields.map((f) => (
              <label
                key={f}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(f)}
                  onChange={() => toggle(f)}
                  className="h-3.5 w-3.5 rounded accent-[#1976D2]"
                />
                <span className="text-xs text-[#333]">{f}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Rating Multi-Select Dropdown ───

function RatingDropdown({
  ratingFilter,
  onRatingFilterChange,
}: {
  ratingFilter: string
  onRatingFilterChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = ratingFilter === "all" ? [] : ratingFilter.split(",")
  const count = selected.length

  const options = [
    { key: "4+", label: "4점 이상" },
    { key: "3+", label: "3점 이상" },
    { key: "new", label: "신규 (미평가)" },
  ]

  function toggle(key: string) {
    if (selected.includes(key)) {
      const next = selected.filter(x => x !== key)
      onRatingFilterChange(next.length > 0 ? next.join(",") : "all")
    } else {
      onRatingFilterChange([...selected, key].join(","))
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`cursor-pointer rounded-full border px-2 py-1 text-[11px] font-medium transition-colors ${
          count > 0
            ? "border-[#1976D2] bg-[#E3F2FD] text-[#1976D2]"
            : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
        }`}
      >
        평가{count > 0 ? ` (${count})` : ""} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-36 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
            {options.map((o) => (
              <label key={o.key} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selected.includes(o.key)}
                  onChange={() => toggle(o.key)}
                  className="h-3.5 w-3.5 rounded accent-[#1976D2]"
                />
                <span className="text-xs text-[#333]">{o.label}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Engagement Filter Dropdown ───

const ENGAGEMENT_OPTIONS = [
  { value: "all", label: "이력 전체" },
  { value: "0", label: "이력 없음" },
  { value: "1", label: "1건 이상" },
  { value: "3", label: "3건 이상" },
  { value: "5", label: "5건 이상" },
  { value: "10", label: "10건 이상" },
]

function EngagementDropdown({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const isActive = value !== "" && value !== "all"
  const current = ENGAGEMENT_OPTIONS.find((o) => o.value === value)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`cursor-pointer rounded-full border px-2 py-1 text-[11px] font-medium transition-colors ${
          isActive
            ? "border-[#1976D2] bg-[#E3F2FD] text-[#1976D2]"
            : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
        }`}
      >
        {isActive ? current?.label : "이력"} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-32 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
            {ENGAGEMENT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className={`w-full cursor-pointer px-3 py-1.5 text-left text-xs hover:bg-gray-50 ${
                  value === opt.value ? "font-semibold text-[#1976D2]" : "text-[#333]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
