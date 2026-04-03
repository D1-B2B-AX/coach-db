"use client"

import { useState, useEffect, useCallback } from "react"
import { isOff } from "@/lib/holidays"
import Badge from "@/components/ui/Badge"

function formatTimeLabel(start: string, end: string): string {
  const sh = parseInt(start.slice(0, 2), 10)
  const eh = parseInt(end.slice(0, 2), 10)
  const parts: string[] = []
  if (sh < 13 && eh > 8) parts.push("오전")
  if ((sh < 18 && eh > 13) || (sh >= 13 && sh < 18)) parts.push("오후")
  if (eh > 18 || sh >= 18) parts.push("저녁")
  if (parts.length === 3) return "전일"
  return parts.length > 0 ? parts.join("·") : "오전"
}

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
  workType?: string | null
}

function getLastMonday(year: number, month: number): Date {
  const lastDay = new Date(year, month + 1, 0)
  const dow = lastDay.getDay()
  const daysSinceMonday = dow === 0 ? 6 : dow - 1
  return new Date(year, month + 1, -daysSinceMonday)
}

function getSamsungRestriction(workType: string | null | undefined, viewYear: number, viewMonth: number): { restricted: boolean; type: "DS" | "DX" | null } {
  if (!workType) return { restricted: false, type: null }

  const isDS = workType.includes("삼전") && workType.toUpperCase().includes("DS")
  const isDX = workType.includes("삼전") && workType.toUpperCase().includes("DX")
  if (!isDS && !isDX) return { restricted: false, type: null }

  const now = new Date()
  const currentYM = now.getFullYear() * 12 + now.getMonth()
  const viewYM = viewYear * 12 + viewMonth
  const type = isDX ? "DX" : "DS"

  // DS: restrict from next month / DX: restrict from this month
  let restrictedFrom = isDX ? currentYM : currentYM + 1

  // After last Monday of the month before the first restricted month,
  // unlock one additional month
  const checkYM = restrictedFrom - 1
  const lastMonday = getLastMonday(
    Math.floor(checkYM / 12),
    checkYM % 12
  )
  if (now >= lastMonday) restrictedFrom += 1

  return { restricted: viewYM >= restrictedFrom, type }
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

export default function ScheduleTab({ coachId, engagements, engagementSchedules, availabilityDetail, workType }: ScheduleTabProps) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([])
  const engSchedules = engagementSchedules
  const [accessLog, setAccessLog] = useState<AccessLog | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedDay, setSelectedDay] = useState<string | null>(null
  )
  const [scheduleCache, setScheduleCache] = useState<Map<string, ScheduleEntry[]>>(new Map())
  const [scoutingDates, setScoutingDates] = useState<Map<string, string>>(new Map()) // date -> managerName

  const yearMonth = `${year}-${String(month + 1).padStart(2, "0")}`
  const { restricted: isRestricted } = getSamsungRestriction(workType, year, month)

  const fetchSchedules = useCallback(async (skipCache = false) => {
    if (isRestricted) {
      setSchedules([])
      setAccessLog(null)
      setLoading(false)
      return
    }
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
      } catch (err) { console.error("Failed to fetch access log:", err) }
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
  }, [coachId, yearMonth, scheduleCache, isRestricted])

  useEffect(() => {
    fetchSchedules()
  }, [fetchSchedules])

  // Fetch scouting data for this coach
  useEffect(() => {
    if (isRestricted) {
      setScoutingDates(new Map())
      return
    }
    async function fetchScoutings() {
      try {
        const firstDay = `${year}-${String(month + 1).padStart(2, "0")}-01`
        const lastDay = `${year}-${String(month + 1).padStart(2, "0")}-${new Date(year, month + 1, 0).getDate()}`
        const res = await fetch(`/api/scoutings?coachId=${coachId}&date=${firstDay}&endDate=${lastDay}`)
        if (res.ok) {
          const data = await res.json()
          const map = new Map<string, string>()
          for (const s of data.scoutings || []) {
            if (s.status === 'cancelled') continue
            const d = s.date.slice(0, 10)
            map.set(d, s.manager?.name || "")
          }
          console.log('[scouting]', coachId, firstDay, '~', lastDay, 'found:', map.size, [...map.entries()])
          setScoutingDates(map)
        } else {
          console.error('[scouting] API error:', res.status, res.statusText)
        }
      } catch (err) { console.error('[scouting] fetch error:', err) }
    }
    fetchScoutings()
  }, [coachId, year, month, isRestricted])

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      {/* Samsung schedule restriction banner */}
      {isRestricted && (
        <div className="rounded-xl bg-[#FFF8E1] border border-[#FFE082] px-4 py-3 text-sm text-[#795548]">
          삼전 우선 배정 코치로, 다음 달 스케줄은 매월 마지막 주 월요일 이후 공개됩니다. 양해 부탁드립니다.
        </div>
      )}
      {/* Calendar + right panel — side by side on desktop */}
      <div className="flex items-start gap-5 max-md:flex-col">
        {/* Calendar */}
        <div className="w-full max-w-[400px] shrink-0 rounded-2xl bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100">
          {/* Access status chip + month navigation (3-column: chip | nav centered | empty) */}
          <div className="mb-5 grid grid-cols-[1fr_auto_1fr] items-center">
            <div>
              {!isRestricted && (
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${accessStatus.className}`}>
                  {accessStatus.label}
                </span>
              )}
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
              {!isRestricted && (
                <button
                  onClick={() => fetchSchedules(true)}
                  disabled={loading}
                  className={`cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    loading ? 'bg-gray-100 text-[#2E7D32]' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {loading ? "불러오는 중..." : "새로고침"}
                </button>
              )}
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
                  const isScouted = scoutingDates.has(key)
                  const isSelected = selectedDay === key

                  let cellClass =
                    "aspect-square flex items-center justify-center rounded-[10px] text-sm transition-all relative cursor-pointer"

                  if (isSelected) {
                    cellClass += " bg-[#ECEFF1] border-2 border-[#546E7A] font-semibold"
                  } else if (isScouted && isAvailable && !isConfirmed) {
                    cellClass += " bg-[#E8F5E9] border-2 border-[#FFB74D] text-[#2E7D32] font-semibold hover:bg-[#C8E6C9]"
                  } else if (isScouted && !isConfirmed) {
                    cellClass += " border-2 border-[#FFB74D] font-semibold hover:bg-gray-100"
                  } else if (isConfirmed) {
                    cellClass += " bg-[#1976D2] text-white font-semibold hover:bg-[#1565C0]"
                  } else if (isAvailable) {
                    cellClass += " bg-[#E8F5E9] text-[#2E7D32] font-semibold hover:bg-[#C8E6C9]"
                  } else {
                    cellClass += " hover:bg-gray-100"
                  }

                  if (!isConfirmed && !isSelected && !isScouted) {
                    if (isOff(key, dayOfWeek)) cellClass += " text-[#E53935]"
                    else if (dayOfWeek === 6) cellClass += " text-[#1565C0]"
                  }

                  if (isToday) {
                    cellClass += " text-base font-bold underline underline-offset-2"
                  }

                  return (
                    <div
                      key={key}
                      className={cellClass}
                      onClick={() => setSelectedDay(isSelected ? null : key)}
                      title={isScouted ? `찜꽁중 (${scoutingDates.get(key)})` : undefined}
                    >
                      {d}
                    </div>
                  )
                })}
              </div>

              {/* Legend */}
              {!isRestricted && <div className="mt-5 flex flex-wrap justify-center gap-3 text-[11px] text-gray-500">
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded-[10px] bg-[#E8F5E9]" />
                  가능
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded-[10px] bg-[#1976D2]" />
                  확정
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded-[10px] border-2 border-[#FFB74D] bg-[#E8F5E9]" />
                  <Badge variant="status" tone="orange">찜꽁중</Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded-[10px] border-2 border-[#546E7A] bg-[#ECEFF1]" />
                  선택 중
                </div>
              </div>}
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
        {!isRestricted && <div className="w-full max-w-[400px] space-y-4">
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

                const scoutManager = scoutingDates.get(selectedDay)
                const availItems = merged.filter(m => m.type === "avail")
                const engItems = merged.filter(m => m.type === "eng")

                // Merge all avail time slots into one label
                const availLabel = availItems.length > 0
                  ? [...new Set(availItems.map(a => formatTimeLabel(a.startTime, a.endTime).split(", ")).flat())].join(", ")
                  : null

                return (
                  <div className="space-y-1">
                    {availLabel && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-[#2E7D32]">{availLabel}</span>
                        {scoutManager !== undefined && (
                          <>
                            <Badge variant="status" tone="orange">찜꽁중</Badge>
                            {scoutManager && <span className="text-gray-400">— {scoutManager}</span>}
                          </>
                        )}
                      </div>
                    )}
                    {!availLabel && scoutManager !== undefined && (
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant="status" tone="orange">찜꽁중</Badge>
                        {scoutManager && <span className="text-gray-400">— {scoutManager}</span>}
                      </div>
                    )}
                    {engItems.map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="shrink-0 text-[#1976D2]">{item.startTime}~{item.endTime}</span>
                        <span className="truncate font-medium text-[#333]">{item.label}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          )}
        </div>}
      </div>
    </div>
  )
}
