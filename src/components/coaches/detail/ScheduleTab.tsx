"use client"

import { useState, useEffect, useCallback } from "react"

interface ScheduleEntry {
  id: string
  date: string
  startTime: string
  endTime: string
}

interface Engagement {
  id: string
  courseName: string
  startDate: string
  endDate: string
  startTime: string | null
  endTime: string | null
  status: string
}

interface AccessLog {
  yearMonth: string
  accessedAt: string
  lastEditedAt: string | null
}

interface ScheduleTabProps {
  coachId: string
  engagements: Engagement[]
  engagementSchedules: EngagementScheduleEntry[]
  availabilityDetail?: string | null
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function getAccessStatus(log: AccessLog | null): { label: string; className: string } {
  if (!log) return { label: "미확인", className: "bg-[#FBE9E7] text-[#D84315]" }
  if (log.lastEditedAt) return { label: "입력완료", className: "bg-[#E8F5E9] text-[#2E7D32]" }
  return { label: "접속만", className: "bg-[#FFF8E1] text-[#F57F17]" }
}

interface EngagementScheduleEntry {
  date: string
  startTime: string
  endTime: string
  engagement: { courseName: string }
}

export default function ScheduleTab({ coachId, engagements, engagementSchedules, availabilityDetail }: ScheduleTabProps) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([])
  const engSchedules = engagementSchedules
  const [accessLog, setAccessLog] = useState<AccessLog | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedDay, setSelectedDay] = useState<string | null>(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  )
  const [scheduleCache, setScheduleCache] = useState<Map<string, ScheduleEntry[]>>(new Map())

  const yearMonth = `${year}-${String(month + 1).padStart(2, "0")}`

  const fetchSchedules = useCallback(async (skipCache = false) => {
    // Use cache if available and not forced refresh
    if (!skipCache && scheduleCache.has(yearMonth)) {
      setSchedules(scheduleCache.get(yearMonth)!)
      setLoading(false)
      try {
        const res = await fetch(`/api/coaches/${coachId}/schedules?yearMonth=${yearMonth}`)
        if (res.ok) {
          const data = await res.json()
          setAccessLog(data.accessLog || null)
        }
      } catch {}
      return
    }
    setLoading(true)
    try {
      const res = await fetch(
        `/api/coaches/${coachId}/schedules?yearMonth=${yearMonth}`
      )
      if (res.ok) {
        const data = await res.json()
        setSchedules(data.schedules || [])
        setAccessLog(data.accessLog || null)
        // Update cache
        setScheduleCache(prev => new Map(prev).set(yearMonth, data.schedules || []))
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [coachId, yearMonth, scheduleCache])

  useEffect(() => {
    fetchSchedules()
  }, [fetchSchedules])

  // Compute 6-month work day summary from cache + engagementSchedules
  const workDaySummary = (() => {
    if (scheduleCache.size === 0) return null
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
    const sixMAgo = new Date(now)
    sixMAgo.setMonth(sixMAgo.getMonth() - 6)
    const cutoff = `${sixMAgo.getFullYear()}-${String(sixMAgo.getMonth() + 1).padStart(2, "0")}-${String(sixMAgo.getDate()).padStart(2, "0")}`

    // Build engagement date set from actual engagement_schedules (cutoff ~ today)
    const engDatesPerMonth = new Map<string, Set<string>>()
    for (const es of engagementSchedules) {
      const key = es.date.slice(0, 10)
      if (key < cutoff || key > todayStr) continue
      const ym = key.slice(0, 7)
      if (!engDatesPerMonth.has(ym)) engDatesPerMonth.set(ym, new Set())
      engDatesPerMonth.get(ym)!.add(key)
    }

    let total = 0
    const months: { label: string; count: number }[] = []
    for (let i = -5; i <= 0; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      // Merge: schedule dates + engagement dates
      const scheduleDates = new Set(
        (scheduleCache.get(ym) || [])
          .map((e) => e.date.slice(0, 10))
          .filter((key) => key >= cutoff && key <= todayStr)
      )
      const engDates = engDatesPerMonth.get(ym) || new Set()
      const merged = new Set([...scheduleDates, ...engDates])
      const count = merged.size
      total += count
      months.push({ label: `${d.getMonth() + 1}월`, count })
    }
    return { total, months }
  })()

  // Pre-fetch 6 months of schedules on mount
  useEffect(() => {
    async function prefetch() {
      const entries = new Map<string, ScheduleEntry[]>()
      const promises: Promise<void>[] = []
      for (let i = -5; i <= 0; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        promises.push(
          fetch(`/api/coaches/${coachId}/schedules?yearMonth=${ym}`)
            .then((r) => r.json())
            .then((data) => { entries.set(ym, data.schedules || []) })
            .catch(() => { entries.set(ym, []) })
        )
      }
      await Promise.all(promises)
      setScheduleCache(entries)
    }
    prefetch()
  }, [coachId])

  function prevMonth() {
    setSelectedDay(null)
    if (month === 0) { setYear(year - 1); setMonth(11) }
    else setMonth(month - 1)
  }

  function nextMonth() {
    setSelectedDay(null)
    if (month === 11) { setYear(year + 1); setMonth(0) }
    else setMonth(month + 1)
  }

  // Build lookup maps
  const scheduleMap = new Map<string, ScheduleEntry[]>()
  for (const s of schedules) {
    const key = s.date.slice(0, 10)
    if (!scheduleMap.has(key)) scheduleMap.set(key, [])
    scheduleMap.get(key)!.push(s)
  }

  const availableDates = new Set<string>()
  for (const [key] of scheduleMap) availableDates.add(key)

  // Confirmed dates: engagement_schedules의 실제 근무일 + 시간
  const engagementDateMap = new Map<string, { courseName: string; startTime: string; endTime: string }[]>()

  for (const es of engSchedules) {
    const key = es.date.slice(0, 10)
    const list = engagementDateMap.get(key) || []
    list.push({ courseName: es.engagement.courseName, startTime: es.startTime, endTime: es.endTime })
    engagementDateMap.set(key, list)
  }

  const engagementDates = new Set(engagementDateMap.keys())

  const firstDayOfWeek = new Date(year, month, 1).getDay() // Sunday = 0
  const lastDate = new Date(year, month + 1, 0).getDate()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`

  const accessStatus = getAccessStatus(accessLog)

  // Selected day schedules
  const selectedSchedules = selectedDay ? scheduleMap.get(selectedDay) || [] : []

  return (
    <div className="space-y-4">
      {/* Calendar + right panel — side by side on desktop */}
      <div className="flex items-start gap-5 max-md:flex-col">
        {/* Calendar */}
        <div className="w-full max-w-[400px] shrink-0 rounded-2xl bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100">
          {/* Access status chip + month navigation (3-column: chip | nav centered | empty) */}
          <div className="mb-5 grid grid-cols-[1fr_auto_1fr] items-center">
            <div>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${accessStatus.className}`}>
                {accessStatus.label}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={prevMonth}
                className="cursor-pointer rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="w-28 text-center text-sm font-semibold tabular-nums text-[#333]">
                {year}년 {month + 1}월
              </span>
              <button
                onClick={nextMonth}
                className="cursor-pointer rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => fetchSchedules(true)}
                disabled={loading}
                className={`cursor-pointer rounded-full p-1.5 transition-colors ${
                  loading ? 'text-[#2E7D32]' : 'text-gray-400 hover:text-[#2E7D32] hover:bg-gray-100'
                }`}
                title={loading ? '불러오는 중...' : '새로고침'}
              >
                <svg className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>

          {/* Weekday headers — Sunday first */}
          <div className="mb-2 grid grid-cols-7 text-center">
            {["일", "월", "화", "수", "목", "금", "토"].map((w, i) => (
              <span
                key={w}
                className={`py-2 text-xs ${
                  i === 0 ? "text-[#E53935]" : i === 6 ? "text-[#1565C0]" : "text-gray-400"
                }`}
              >
                {w}
              </span>
            ))}
          </div>

          {loading ? (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 35 }).map((_, i) => (
                  <div key={i} className="aspect-square animate-pulse rounded-lg bg-gray-100" />
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Days grid */}
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                  <div key={`empty-${i}`} className="aspect-square" />
                ))}

                {Array.from({ length: lastDate }).map((_, i) => {
                  const d = i + 1
                  const key = dateKey(year, month, d)
                  const dayOfWeek = new Date(year, month, d).getDay()
                  const isToday = key === todayStr
                  const isConfirmed = engagementDates.has(key)
                  const isAvailable = availableDates.has(key)
                  const isSelected = selectedDay === key

                  let cellClass =
                    "aspect-square flex items-center justify-center rounded-[10px] text-sm transition-all relative cursor-pointer"

                  if (isSelected) {
                    cellClass += " bg-[#FFF3E0] border-2 border-[#FF9800] font-semibold"
                  } else if (isConfirmed) {
                    cellClass += " bg-[#1976D2] text-white font-semibold hover:bg-[#1565C0]"
                  } else if (isAvailable) {
                    cellClass += " bg-[#E8F5E9] text-[#2E7D32] font-semibold hover:bg-[#C8E6C9]"
                  } else {
                    cellClass += " hover:bg-gray-100"
                  }

                  if (!isConfirmed && !isSelected) {
                    if (dayOfWeek === 0) cellClass += " text-[#E53935]" // Sunday
                    if (dayOfWeek === 6) cellClass += " text-[#1565C0]" // Saturday
                  }

                  if (isToday && !isSelected) {
                    cellClass += " ring-2 ring-[#1565C0]"
                  }

                  return (
                    <div
                      key={key}
                      className={cellClass}
                      onClick={() => setSelectedDay(isSelected ? null : key)}
                    >
                      {d}
                    </div>
                  )
                })}
              </div>

              {/* Legend */}
              <div className="mt-5 flex flex-wrap justify-center gap-3 text-[11px] text-gray-500">
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded border border-[#A5D6A7] bg-[#E8F5E9]" />
                  가용
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded bg-[#1976D2]" />
                  확정
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded border-2 border-[#FF9800] bg-[#FFF3E0]" />
                  선택 중
                </div>
              </div>
            </>
          )}

          {/* 6-month work day summary */}
          {workDaySummary && (
            <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">최근 6개월 누적 근무일 수</span>
                <span className="text-sm font-bold text-[#1976D2]">{workDaySummary.total}일</span>
              </div>
              <div className="mt-2 flex gap-1">
                {workDaySummary.months.map((m) => (
                  <div key={m.label} className="flex-1 text-center">
                    <div
                      className="mx-auto rounded bg-[#1976D2] transition-all"
                      style={{
                        height: `${Math.max(4, m.count * 2)}px`,
                        opacity: m.count > 0 ? 0.3 + Math.min(0.7, m.count / 20) : 0.1,
                      }}
                    />
                    <div className="mt-1 text-[10px] text-gray-400">{m.label}</div>
                    <div className="text-[10px] font-medium text-gray-600">{m.count}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right panel — availability detail + selected day */}
        <div className="w-full max-w-[400px] space-y-4">
          {availabilityDetail && (
            <div className="rounded-xl bg-white border border-gray-200 px-4 py-3">
              <div className="text-xs font-semibold text-gray-400 mb-1">근무 가능 세부 내용</div>
              <div className="max-h-24 overflow-y-auto text-sm text-[#333] whitespace-pre-wrap">{availabilityDetail}</div>
            </div>
          )}
          {selectedDay && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-2 text-sm font-semibold text-[#333]">
                {parseInt(selectedDay.split("-")[1])}월 {parseInt(selectedDay.split("-")[2])}일
              </div>
              {(() => {
                const dayEngs = engagementDateMap.get(selectedDay) || []
                const hasCoachSchedule = selectedSchedules.length > 0
                const hasEngagement = dayEngs.length > 0

                if (!hasCoachSchedule && !hasEngagement) {
                  return <div className="text-xs text-gray-400">등록된 스케줄 없음</div>
                }

                // Merge and sort by startTime
                const merged: { startTime: string; endTime: string; type: "avail" | "eng"; label?: string }[] = [
                  ...selectedSchedules.map(s => ({ startTime: s.startTime, endTime: s.endTime, type: "avail" as const })),
                  ...dayEngs.map(e => ({ startTime: e.startTime, endTime: e.endTime, type: "eng" as const, label: e.courseName.replace(/^\[.*?\]\s*/, '').replace(/^\(B2B\)\s*/, '') })),
                ]
                merged.sort((a, b) => a.startTime.localeCompare(b.startTime))

                return (
                  <div className="space-y-1">
                    {merged.map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className={`shrink-0 ${item.type === "avail" ? "text-[#2E7D32]" : "text-[#1976D2]"}`}>
                          {item.startTime}~{item.endTime}
                        </span>
                        <span className={`truncate ${item.type === "avail" ? "text-[#2E7D32]" : "font-medium text-[#333]"}`}>
                          {item.type === "avail" ? "가용" : item.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
