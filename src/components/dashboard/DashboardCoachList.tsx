"use client"

import { useMemo, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Skeleton } from "@/components/Skeleton"
import Badge from "@/components/ui/Badge"
import Button from "@/components/ui/Button"
import type { CourseOption } from "@/components/CourseSelector"
import { Table, TableEmpty } from "@/components/ui/Table"
import {
  CONTROL_BORDER_COLOR,
  CONTROL_BORDER_RADIUS,
  FILTER_PILL_BASE,
  TABLE_DIVIDER_COLOR,
} from "@/components/ui/styles"

interface CoachSchedule {
  startTime: string
  endTime: string
}

interface CoachEntry {
  id: string
  name: string
  phone?: string | null
  email?: string | null
  workType?: string | null
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
  scoutingManagers?: Record<string, string>
  onBulkScout?: (coachIds: string[]) => void
  courses?: CourseOption[]
  selectedCourseId?: string | null
  onCourseChange?: (courseId: string | null) => void
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

function toMinutes(time: string): number {
  const [h = "0", m = "0"] = time.split(":")
  return parseInt(h, 10) * 60 + parseInt(m, 10)
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
  scoutingManagers,
  onBulkScout,
  courses,
  selectedCourseId,
  onCourseChange,
  onReset,
}: DashboardCoachListProps) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const allFields = useMemo(() => {
    const set = new Set<string>()
    for (const c of coaches) for (const f of c.fields) set.add(f)
    return [...set].sort()
  }, [coaches])

  // Check if a coach's schedule overlaps with a time range
  function hasTimeOverlap(schedules: CoachSchedule[], startTime: string, endTime: string): boolean {
    const filterStart = toMinutes(startTime)
    const filterEnd = toMinutes(endTime)
    return schedules.some((s) => {
      const scheduleStart = toMinutes(s.startTime)
      const scheduleEnd = toMinutes(s.endTime)
      return scheduleStart < filterEnd && scheduleEnd > filterStart
    })
  }

  const filteredCoaches = useMemo(() => {
    return coaches.filter((c) => {
      // Time filter (multi-select: all selected ranges must match)
      if (timeFilter !== "all") {
        const ranges = timeFilter.split(",").filter(Boolean)
        const matchesAll = ranges.every((range) => {
          const [s, e] = range.split("-")
          return hasTimeOverlap(c.schedules, `${s}:00`, `${e}:00`)
        })
        if (!matchesAll) return false
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
      <Table className="space-y-0">
        {courses && onCourseChange && (
          <div className={`border-b ${TABLE_DIVIDER_COLOR} px-5 py-2.5 flex items-center justify-between gap-2`}>
            <span className="text-[11px] text-gray-400">날짜를 선택하거나 과정을 선택하세요</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <select
                value={selectedCourseId ?? ""}
                onChange={(e) => onCourseChange(e.target.value || null)}
                className={`min-w-[160px] ${CONTROL_BORDER_RADIUS} ${CONTROL_BORDER_COLOR} bg-white px-2 py-1 text-xs focus:border-blue-400 focus:outline-none`}
              >
                <option value="">과정 선택</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}
        <div className="p-8 text-center text-sm text-gray-400">
          날짜를 선택하면 가능한 코치 목록이 표시됩니다
        </div>
      </Table>
    )
  }

  // Filter summary — natural sentence with highlights
  return (
    <Table className="min-w-0 overflow-hidden space-y-0">
      {/* Filter summary + course selector */}
      <div className={`border-b ${TABLE_DIVIDER_COLOR} px-4 py-3 sm:px-5`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {selectedDate
              ? selectedIds.size > 0 && onBulkScout && (
                <Button
                  onClick={() => onBulkScout([...selectedIds])}
                  variant={selectedCourseId ? "primaryOutline" : "secondary"}
                  size="sm"
                  className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium"
                >
                  찜꽁 ({selectedIds.size})
                </Button>
              )
              : <span className="text-[11px] text-gray-400">날짜를 선택하거나 과정을 선택하세요</span>
            }
          </div>
          {courses && onCourseChange && (
            <div className="flex items-center gap-1.5 flex-nowrap shrink-0">
              <select
                value={selectedCourseId ?? ""}
                onChange={(e) => onCourseChange(e.target.value || null)}
                className={`w-[132px] shrink-0 ${CONTROL_BORDER_RADIUS} ${CONTROL_BORDER_COLOR} bg-white px-2.5 py-1.5 text-xs text-[#333] focus:border-blue-400 focus:outline-none`}
              >
                <option value="">과정 선택</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
      {/* Coach rows */}
      <div>
        {loading ? (
          <div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-4 py-3 border-b border-gray-50 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-6 ml-auto" />
                </div>
                <div className="flex items-center gap-3 ml-6">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-16 ml-auto" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredCoaches.length === 0 ? (
          <TableEmpty>해당 조건에 맞는 코치가 없습니다</TableEmpty>
        ) : (
          <>
            {/* Table header */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50/50">
              <div className="w-4 flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={selectedIds.size === filteredCoaches.length && filteredCoaches.length > 0}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-gray-300 accent-[#1976D2]"
                />
              </div>
              <span className="text-[11px] font-medium text-gray-400">{filteredCoaches.length}명</span>
            </div>
            {filteredCoaches.map((coach) => {
              const today = new Date().toISOString().slice(0, 10)
              const allEngs = coach.recentEngagements || (coach.latestEngagement ? [coach.latestEngagement] : [])
              const pastEng = allEngs.find(e => e.endDate < today)
              const futureEng = allEngs.find(e => e.endDate >= today)
              const latest = pastEng || futureEng || null
              const courseName = latest
                ? latest.courseName.replace(/\[부가세\s*별도\]\s*/g, "").replace(/\(B2B\)\s*/g, "").replace(/_/g, " ").trim()
                : null
              const courseLabel = latest ? (latest.endDate >= today ? "참여예정과정" : "참여과정") : "참여과정"
              const managerLabel = scoutingManagers?.[coach.id]
              return (
                <div
                  key={coach.id}
                  onClick={() => router.push(`/coaches/${coach.id}`)}
                  className={`px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${selectedIds.has(coach.id) ? "bg-blue-50/40" : ""}`}
                >
                  {/* 1줄: 체크박스 + 이름 + 분야 태그 + 평점 */}
                  <div className="flex items-center gap-2">
                    <div className="w-4 flex items-center justify-center shrink-0" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(coach.id)}
                        onChange={() => toggleId(coach.id)}
                        className="h-4 w-4 rounded border-gray-300 accent-[#1976D2]"
                      />
                    </div>
                    <span className="text-[13px] font-semibold text-[#222]">{coach.name}</span>
                    {managerLabel && (
                      <Badge variant="status" tone="orange" className="shrink-0">
                        {`찜꽁 · ${managerLabel}`}
                      </Badge>
                    )}
                    {coach.fields.length > 0 && (
                      <div className="flex items-center gap-1">
                        {coach.fields.map(f => (
                          <span key={f} className="rounded-full bg-[#F0F4F8] px-2 py-0.5 text-[10px] font-medium text-[#455A64]">{f}</span>
                        ))}
                      </div>
                    )}
                    <span className="ml-auto text-[13px] shrink-0">
                      {coach.avgRating !== null ? <span className="text-[#F57F17] font-semibold">{coach.avgRating.toFixed(1)}</span> : <span className="text-gray-300">-</span>}
                    </span>
                  </div>
                  {/* 2줄: 근무유형 + 가능시간 + 최근과정 */}
                  <div className="flex items-center gap-2 mt-1.5 ml-6 text-[11px]">
                    {coach.workType && (
                      <span className="text-gray-400">{coach.workType}</span>
                    )}
                    {coach.workType && <span className="text-gray-200">|</span>}
                    <span><span className="text-gray-400">가능시간: </span><span className="text-[#1976D2] font-medium">{formatScheduleLabel(coach.schedules)}</span></span>
                    <span className="text-gray-200">|</span>
                    <span className="truncate"><span className="text-gray-400">{courseLabel}: </span><span className="text-gray-500">{courseName || "-"}</span></span>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

    </Table>
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
        className={`${FILTER_PILL_BASE} ${
          count > 0
            ? "border-[#1976D2] bg-[#E3F2FD] text-[#1976D2]"
            : `${CONTROL_BORDER_COLOR} bg-white text-gray-500 hover:bg-gray-50`
        }`}
      >
        분야{count > 0 ? ` (${count})` : ""} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className={`absolute left-0 top-full z-20 mt-1 w-44 ${CONTROL_BORDER_RADIUS} ${CONTROL_BORDER_COLOR} bg-white py-1 shadow-lg`}>
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
        className={`${FILTER_PILL_BASE} ${
          count > 0
            ? "border-[#1976D2] bg-[#E3F2FD] text-[#1976D2]"
            : `${CONTROL_BORDER_COLOR} bg-white text-gray-500 hover:bg-gray-50`
        }`}
      >
        평가{count > 0 ? ` (${count})` : ""} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className={`absolute left-0 top-full z-20 mt-1 w-36 ${CONTROL_BORDER_RADIUS} ${CONTROL_BORDER_COLOR} bg-white py-1 shadow-lg`}>
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
        className={`${FILTER_PILL_BASE} ${
          isActive
            ? "border-[#1976D2] bg-[#E3F2FD] text-[#1976D2]"
            : `${CONTROL_BORDER_COLOR} bg-white text-gray-500 hover:bg-gray-50`
        }`}
      >
        {isActive ? current?.label : "이력"} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className={`absolute left-0 top-full z-20 mt-1 w-32 ${CONTROL_BORDER_RADIUS} ${CONTROL_BORDER_COLOR} bg-white py-1 shadow-lg`}>
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
