"use client"

import { useState, useEffect, useCallback, useRef } from "react"

import DashboardCalendar from "@/components/dashboard/DashboardCalendar"
import DashboardCoachList from "@/components/dashboard/DashboardCoachList"
import Toast from "@/components/Toast"

type DashboardVariant = "general" | "samsung"

interface DashboardContentProps {
  variant: DashboardVariant
}

interface StatusData {
  yearMonth: string
  status: {
    notAccessed: number
    accessedOnly: number
    completed: number
  }
  notAccessedCoaches: { id: string; name: string }[]
}

interface CoachEntry {
  id: string
  name: string
  schedules: { startTime: string; endTime: string }[]
  fields: string[]
  avgRating: number | null
  latestEngagement: { courseName: string; endDate: string } | null
  recentEngagements?: { courseName: string; endDate: string }[]
  engagementCount?: number
  workDays?: number
}

function formatYearMonth(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export default function DashboardContent({ variant }: DashboardContentProps) {
  const now = new Date()
  const [currentYear, setCurrentYear] = useState(now.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(now.getMonth())
  const [selectedStart, setSelectedStart] = useState<string | null>(null)
  const [selectedEnd, setSelectedEnd] = useState<string | null>(null)
  const [monthData, setMonthData] = useState<Record<string, number>>({})
  const [coaches, setCoaches] = useState<CoachEntry[]>([])
  const [scoutedCoachIds, setScoutedCoachIds] = useState<Set<string>>(new Set())
  const [statusData, setStatusData] = useState<StatusData | null>(null)
  const [timeFilter, setTimeFilter] = useState<string>(variant === "samsung" ? "08-18" : "all")
  const [fieldFilter, setFieldFilter] = useState<string>("all")
  const [ratingFilter, setRatingFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [engagementFilter, setEngagementFilter] = useState<string>("all")

  const [monthLoading, setMonthLoading] = useState(false)
  const [coachLoading, setCoachLoading] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)
  const [toastMessage, setToastMessage] = useState("")
  const [showToast, setShowToast] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const yearMonth = formatYearMonth(currentYear, currentMonth)

  // Fetch month summary data
  const fetchMonthData = useCallback(async () => {
    setMonthLoading(true)
    try {
      const params = new URLSearchParams()
      if (timeFilter !== "all") {
        params.set("timeFilter", timeFilter)
      }
      if (variant === "general") params.set("coachFilter", "exclude-samsung")
      else if (variant === "samsung") params.set("coachFilter", "samsung-only")
      const qs = params.toString() ? `?${params}` : ""
      const res = await fetch(`/api/schedules/${yearMonth}${qs}`)
      if (res.ok) {
        const data = await res.json()
        setMonthData(data.days || {})
      }
    } catch {
      // silently fail for polling
    } finally {
      setMonthLoading(false)
    }
  }, [yearMonth, timeFilter, variant])

  // Fetch status data
  const fetchStatusData = useCallback(async () => {
    setStatusLoading(true)
    try {
      const res = await fetch(`/api/schedules/${yearMonth}/status`)
      if (res.ok) {
        const data = await res.json()
        setStatusData(data)
      }
    } catch {
      // silently fail
    } finally {
      setStatusLoading(false)
    }
  }, [yearMonth])

  // Fetch coaches for selected date (or date range)
  const fetchCoaches = useCallback(async () => {
    if (!selectedStart) {
      setCoaches([])
      setScoutedCoachIds(new Set())
      return
    }
    setCoachLoading(true)
    try {
      const day = parseInt(selectedStart.split("-")[2], 10)
      const ym = selectedStart.slice(0, 7)
      const params = new URLSearchParams()
      if (selectedEnd) params.set("endDate", selectedEnd)
      if (timeFilter !== "all") {
        params.set("timeFilter", timeFilter)
      }
      if (variant === "general") params.set("coachFilter", "exclude-samsung")
      else if (variant === "samsung") params.set("coachFilter", "samsung-only")
      const qs = params.toString() ? `?${params}` : ""

      const scoutParams = new URLSearchParams({ date: selectedStart })
      if (selectedEnd) scoutParams.set("endDate", selectedEnd)

      const [coachRes, scoutRes] = await Promise.all([
        fetch(`/api/schedules/${ym}/${day}${qs}`),
        fetch(`/api/scoutings?${scoutParams}`),
      ])
      if (coachRes.ok) {
        const data = await coachRes.json()
        setCoaches(data.coaches || [])
      }
      if (scoutRes.ok) {
        const data = await scoutRes.json()
        setScoutedCoachIds(new Set(
          (data.scoutings || [])
            .filter((s: { status?: string }) => s.status !== 'cancelled')
            .map((s: { coachId: string }) => s.coachId)
        ))
      }
    } catch {
      // silently fail
    } finally {
      setCoachLoading(false)
    }
  }, [selectedStart, selectedEnd, timeFilter, variant])

  // On mount + month change: fetch month data + status
  useEffect(() => {
    fetchMonthData()
    fetchStatusData()
  }, [fetchMonthData, fetchStatusData])

  // 30-second polling for month data
  useEffect(() => {
    pollingRef.current = setInterval(() => {
      fetchMonthData()
    }, 30_000)
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [fetchMonthData])

  // Fetch coaches when selectedDate or timeFilter changes
  useEffect(() => {
    fetchCoaches()
  }, [fetchCoaches])

  // Navigate months
  const canGoPrev = currentYear * 12 + currentMonth > now.getFullYear() * 12 + now.getMonth()
  const canGoNext = currentYear * 12 + currentMonth < now.getFullYear() * 12 + 11

  function handlePrevMonth() {
    if (!canGoPrev) return
    if (currentMonth === 0) {
      setCurrentYear((y) => y - 1)
      setCurrentMonth(11)
    } else {
      setCurrentMonth((m) => m - 1)
    }
    setSelectedStart(null)
    setSelectedEnd(null)
    setTimeFilter("all")
  }

  function handleNextMonth() {
    if (!canGoNext) return
    if (currentMonth === 11) {
      setCurrentYear((y) => y + 1)
      setCurrentMonth(0)
    } else {
      setCurrentMonth((m) => m + 1)
    }
    setSelectedStart(null)
    setSelectedEnd(null)
    setTimeFilter("all")
  }

  function handleSelectDate(dateStr: string) {
    const todayStr = formatDate(new Date())

    // 이미 선택된 날짜를 다시 누르면 선택 해제
    if (dateStr === selectedStart && !selectedEnd) {
      setSelectedStart(null)
      return
    }

    // 과거 날짜는 단일 선택만 (범위 선택 불가)
    if (dateStr < todayStr) {
      setSelectedStart(dateStr)
      setSelectedEnd(null)
      return
    }

    if (!selectedEnd && selectedStart && selectedStart >= todayStr && dateStr > selectedStart) {
      setSelectedEnd(dateStr)
    } else {
      setSelectedStart(dateStr)
      setSelectedEnd(null)
    }
  }

  function handleTimeFilterChange(filter: string) {
    setTimeFilter(filter)
  }

  async function handleSyncAndRefresh() {
    setSyncing(true)
    try {
      const res = await fetch('/api/sync/engagements', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setToastMessage(`동기화 완료: ${data.created}건 생성, ${data.skipped}건 스킵`)
        setShowToast(true)
      } else {
        setToastMessage(`동기화 실패: ${data.error}`)
        setShowToast(true)
      }
    } catch {
      setToastMessage('동기화 중 오류 발생')
      setShowToast(true)
    } finally {
      setSyncing(false)
      fetchMonthData()
    }
  }

  function handleToday() {
    const today = new Date()
    setCurrentYear(today.getFullYear())
    setCurrentMonth(today.getMonth())
    setSelectedStart(formatDate(today))
    setSelectedEnd(null)
    setTimeFilter("all")
  }

  function handleReset() {
    setSelectedEnd(null)
    setTimeFilter("all")
  }

  function handleStatusRefresh() {
    fetchStatusData()
    fetchMonthData()
  }

  async function handleScoutToggle(coachId: string) {
    console.log('[컨택] 토글:', coachId, 'date:', selectedStart)
    if (!selectedStart) return
    try {
      const res = await fetch('/api/scoutings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachId, date: selectedStart }),
      })
      if (res.ok) {
        const data = await res.json()
        setScoutedCoachIds((prev) => {
          const next = new Set(prev)
          if (data.action === 'added') next.add(coachId)
          else next.delete(coachId)
          return next
        })
      } else {
        const err = await res.json().catch(() => ({}))
        console.error('컨택 토글 실패:', res.status, err)
        setToastMessage(`컨택 처리 실패: ${err.error || res.statusText}`)
        setShowToast(true)
      }
    } catch (e) {
      console.error('컨택 토글 에러:', e)
      setToastMessage('컨택 처리 중 네트워크 오류')
      setShowToast(true)
    }
  }

  return (
    <div className="mx-auto max-w-6xl overflow-x-hidden px-4 py-6 sm:px-6">
      {/* Main content: calendar + coach list */}
      <div className="grid min-w-0 gap-5 md:grid-cols-[340px_1fr] lg:grid-cols-[380px_1fr]">
        <DashboardCalendar
          year={currentYear}
          month={currentMonth}
          selectedStart={selectedStart}
          selectedEnd={selectedEnd}
          monthData={monthData}
          onSelectDate={handleSelectDate}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
          canGoPrev={canGoPrev}
          canGoNext={canGoNext}
          onToday={handleToday}
          onRefresh={handleSyncAndRefresh}
          syncing={syncing}
          timeFilter={timeFilter}
          onTimeFilterChange={handleTimeFilterChange}
        />
        <DashboardCoachList
          selectedDate={selectedStart}
          selectedEnd={selectedEnd}
          coaches={coaches}
          loading={coachLoading}
          timeFilter={timeFilter}
          onTimeFilterChange={handleTimeFilterChange}
          fieldFilter={fieldFilter}
          onFieldFilterChange={setFieldFilter}
          ratingFilter={ratingFilter}
          onRatingFilterChange={setRatingFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          engagementFilter={engagementFilter}
          onEngagementFilterChange={setEngagementFilter}
          scoutedCoachIds={scoutedCoachIds}
          onScoutToggle={handleScoutToggle}
        />
      </div>

      <Toast
        message={toastMessage}
        show={showToast}
        onClose={() => setShowToast(false)}
      />
    </div>
  )
}
