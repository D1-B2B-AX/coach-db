"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"

import DashboardCalendar from "@/components/dashboard/DashboardCalendar"
import DashboardCoachList from "@/components/dashboard/DashboardCoachList"
import Toast from "@/components/Toast"
import type { CourseOption } from "@/components/CourseSelector"
import { isOff } from "@/lib/holidays"

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

function parseYearMonthParam(yearMonth: string | null): { year: number; month: number } | null {
  if (!yearMonth) return null
  const match = yearMonth.match(/^(\d{4})-(\d{2})$/)
  if (!match) return null
  const year = parseInt(match[1], 10)
  const monthIndex = parseInt(match[2], 10) - 1
  if (Number.isNaN(year) || Number.isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) return null
  return { year, month: monthIndex }
}

function buildDateSet(start: string, end: string) {
  const dates = new Set<string>()
  const cursor = new Date(`${start}T12:00:00Z`)
  const limit = new Date(`${end}T12:00:00Z`)
  while (cursor <= limit) {
    dates.add(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

const TIME_PRESETS = [
  { key: "08-13", label: "오전", startMinutes: 8 * 60, endMinutes: 13 * 60 },
  { key: "13-18", label: "오후", startMinutes: 13 * 60, endMinutes: 18 * 60 },
  { key: "18-22", label: "저녁", startMinutes: 18 * 60, endMinutes: 22 * 60 },
] as const

type TimeFilterSource = "default" | "course-auto" | "manual"

function timeToMinutes(time: string): number {
  const [hour = "0", minute = "0"] = time.split(":")
  return parseInt(hour, 10) * 60 + parseInt(minute, 10)
}

function normalizeTimeFilter(filter: string): string {
  if (filter === "all") return "all"
  const selected = filter.split(",").filter(Boolean)
  const ordered = TIME_PRESETS.map((preset) => preset.key).filter((key) => selected.includes(key))
  return ordered.length > 0 ? ordered.join(",") : "all"
}

function parseCourseTimeRanges(workHours?: string | null): Array<{ date: string; startTime: string; endTime: string }> {
  if (!workHours) return []

  return workHours
    .split("\n")
    .map((line) => line.match(/^(\d{4}-\d{2}-\d{2})\(.+?\)\s+(\d{2}:\d{2})-(\d{2}:\d{2})/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => ({
      date: match[1],
      startTime: match[2],
      endTime: match[3],
    }))
}

function getPresetKeysForCourseTime(startTime: string, endTime: string): string[] {
  const startMinutes = timeToMinutes(startTime)
  const endMinutes = timeToMinutes(endTime)

  return TIME_PRESETS
    .filter((preset) => startMinutes < preset.endMinutes && endMinutes > preset.startMinutes)
    .map((preset) => preset.key)
}

function getTimeFilterLabels(filter: string): string[] {
  if (filter === "all") return ["전체"]
  return normalizeTimeFilter(filter)
    .split(",")
    .filter(Boolean)
    .map((key) => TIME_PRESETS.find((preset) => preset.key === key)?.label || key)
}

function getTimeAvailabilityPhrase(filter: string): string {
  if (filter === "all") return "전체 코치를 표시합니다."
  const labels = getTimeFilterLabels(filter)
  return labels.length === 1
    ? `${labels[0]} 가능 코치만 표시합니다.`
    : `${labels.join("·")} 모두 가능한 코치만 표시합니다.`
}

function getCourseTimeDescriptor(filter: string): string {
  const normalized = normalizeTimeFilter(filter)
  if (normalized === "08-13,13-18") return "주간"
  if (normalized === "08-13,13-18,18-22") return "전일"
  return getTimeFilterLabels(normalized).join("·")
}

function formatCourseTimeRange(timeRanges: Array<{ startTime: string; endTime: string }>): string {
  const starts = timeRanges.map(r => r.startTime)
  const ends = timeRanges.map(r => r.endTime)
  const minStart = starts.sort()[0]
  const maxEnd = ends.sort().reverse()[0]
  return `${minStart}~${maxEnd}`
}

function inferCourseTimeFilter(course: CourseOption | null): { filter: string; helper: string } {
  if (!course) {
    return { filter: "all", helper: "과정을 선택하면 과정 시간 기준으로 자동 적용됩니다." }
  }

  const timeRanges = parseCourseTimeRanges(course.workHours)
  if (timeRanges.length === 0) {
    return {
      filter: "all",
      helper: `${course.name} — 시간 정보 없음, 전체 코치 표시. 시간대를 직접 수정하세요.`,
    }
  }

  const timeStr = formatCourseTimeRange(timeRanges)

  const distinctFilters = new Set(
    timeRanges.map((timeRange) => normalizeTimeFilter(getPresetKeysForCourseTime(timeRange.startTime, timeRange.endTime).join(",")))
  )

  if (distinctFilters.size !== 1) {
    return {
      filter: "all",
      helper: `${course.name} (${timeStr}) — 날짜별 시간이 달라 전체 코치 표시. 시간대를 직접 수정하세요.`,
    }
  }

  const [filter] = [...distinctFilters]
  if (filter === "all") {
    return {
      filter: "all",
      helper: `${course.name} (${timeStr}) — 시간대 자동 해석 불가, 전체 코치 표시. 시간대를 직접 수정하세요.`,
    }
  }
  const descriptor = getCourseTimeDescriptor(filter)

  return {
    filter,
    helper: `${course.name} (${timeStr}) — ${descriptor} 과정, ${getTimeAvailabilityPhrase(filter)}`,
  }
}

function getManualTimeFilterHelper(filter: string, hasSelectedCourse: boolean): string {
  if (hasSelectedCourse) {
    return `과정 시간 자동 적용 후 직접 수정했습니다. 현재는 ${getTimeAvailabilityPhrase(filter)}`
  }
  return filter === "all"
    ? "전체 코치를 표시합니다."
    : `직접 선택한 시간대 기준으로 ${getTimeAvailabilityPhrase(filter)}`
}

export default function DashboardContent({ variant }: DashboardContentProps) {
  const now = new Date()
  const [currentYear, setCurrentYear] = useState(now.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(now.getMonth())
  const [selectedStart, setSelectedStart] = useState<string | null>(null)
  const [selectedEnd, setSelectedEnd] = useState<string | null>(null)
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  const [monthData, setMonthData] = useState<Record<string, number>>({})
  const [coaches, setCoaches] = useState<CoachEntry[]>([])
  const [statusData, setStatusData] = useState<StatusData | null>(null)
  const [timeFilter, setTimeFilter] = useState<string>("all")
  const [timeFilterSource, setTimeFilterSource] = useState<TimeFilterSource>("default")
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
  const [courses, setCourses] = useState<CourseOption[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null)
  const yearMonth = formatYearMonth(currentYear, currentMonth)

  // ── Restore filters from URL on mount & sync changes back ──
  const isFirstFilterSync = useRef(true)
  useEffect(() => {
    if (isFirstFilterSync.current) {
      isFirstFilterSync.current = false
      const params = new URLSearchParams(window.location.search)
      const restoredYearMonth = parseYearMonthParam(params.get("yearMonth"))
      if (restoredYearMonth) {
        setCurrentYear(restoredYearMonth.year)
        setCurrentMonth(restoredYearMonth.month)
      }
      if (params.has("selectedStart")) setSelectedStart(params.get("selectedStart"))
      if (params.has("selectedEnd")) setSelectedEnd(params.get("selectedEnd"))
      if (params.has("selectedDates")) {
        setSelectedDates(new Set(params.get("selectedDates")!.split(",").filter(Boolean)))
      }
      if (params.has("courseId")) setSelectedCourseId(params.get("courseId"))
      if (params.has("timeFilter")) {
        const v = params.get("timeFilter")!
        setTimeFilter(v)
        const sourceParam = params.get("timeFilterSource")
        if (sourceParam === "course-auto" || sourceParam === "manual" || sourceParam === "default") {
          setTimeFilterSource(sourceParam)
        } else {
          setTimeFilterSource(v === "all" ? "default" : "manual")
        }
      }
      if (params.has("fieldFilter")) setFieldFilter(params.get("fieldFilter")!)
      if (params.has("ratingFilter")) setRatingFilter(params.get("ratingFilter")!)
      if (params.has("statusFilter")) setStatusFilter(params.get("statusFilter")!)
      if (params.has("engagementFilter")) setEngagementFilter(params.get("engagementFilter")!)
      return
    }
    const params = new URLSearchParams()
    params.set("yearMonth", yearMonth)
    if (selectedStart) params.set("selectedStart", selectedStart)
    if (selectedEnd) params.set("selectedEnd", selectedEnd)
    if (selectedDates.size > 0) params.set("selectedDates", [...selectedDates].sort().join(","))
    if (selectedCourseId) params.set("courseId", selectedCourseId)
    if (timeFilter !== "all") params.set("timeFilter", timeFilter)
    if (timeFilterSource !== "default") params.set("timeFilterSource", timeFilterSource)
    if (fieldFilter !== "all") params.set("fieldFilter", fieldFilter)
    if (ratingFilter !== "all") params.set("ratingFilter", ratingFilter)
    if (statusFilter !== "all") params.set("statusFilter", statusFilter)
    if (engagementFilter !== "all") params.set("engagementFilter", engagementFilter)
    const qs = params.toString()
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname)
  }, [
    yearMonth,
    selectedStart,
    selectedEnd,
    selectedDates,
    selectedCourseId,
    timeFilter,
    timeFilterSource,
    fieldFilter,
    ratingFilter,
    statusFilter,
    engagementFilter,
  ])

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId]
  )
  const courseAutoTimeFilter = useMemo(
    () => inferCourseTimeFilter(selectedCourse),
    [selectedCourse]
  )
  const timeFilterBadgeLabel = useMemo(() => {
    if (selectedCourseId) {
      return timeFilterSource === "course-auto" ? "자동 적용" : "직접 수정"
    }
    if (timeFilter !== "all") return "수동 필터"
    return null
  }, [selectedCourseId, timeFilter, timeFilterSource])
  const timeFilterHelper = useMemo(() => {
    if (selectedCourseId) {
      return timeFilterSource === "course-auto"
        ? courseAutoTimeFilter.helper
        : getManualTimeFilterHelper(timeFilter, true)
    }
    if (timeFilter !== "all") return getManualTimeFilterHelper(timeFilter, false)
    return "과정을 선택하면 과정 시간 기준으로 자동 적용됩니다."
  }, [courseAutoTimeFilter.helper, selectedCourseId, timeFilter, timeFilterSource])

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
      if (res.status === 401) { window.location.href = '/login'; return }
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
      if (res.status === 401) { window.location.href = '/login'; return }
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

      const coachRes = await fetch(`/api/schedules/${ym}/${day}${qs}`)
      if (coachRes.status === 401) { window.location.href = '/login'; return }
      if (coachRes.ok) {
        const data = await coachRes.json()
        setCoaches(data.coaches || [])
      }
    } catch {
      // silently fail
    } finally {
      setCoachLoading(false)
    }
  }, [selectedStart, selectedEnd, timeFilter, variant])

  // Fetch courses for the manager
  const fetchCourses = useCallback(async () => {
    try {
      const res = await fetch("/api/courses")
      if (res.status === 401) { window.location.href = '/login'; return }
      if (res.ok) {
        const data = await res.json()
        setCourses((data.courses || []).map((c: { id: string; name: string; startDate: string | null; endDate: string | null; description: string | null; workHours: string | null }) => ({
          id: c.id, name: c.name, startDate: c.startDate, endDate: c.endDate, description: c.description, workHours: c.workHours,
        })))
      }
    } catch { /* silently fail */ }
  }, [])

  // On mount + month change: fetch month data + status
  useEffect(() => {
    fetchMonthData()
    fetchStatusData()
    fetchCourses()
  }, [fetchMonthData, fetchStatusData, fetchCourses])

  // 30-second polling for month data (paused when tab is hidden)
  useEffect(() => {
    function startPolling() {
      if (pollingRef.current) clearInterval(pollingRef.current)
      pollingRef.current = setInterval(() => {
        fetchMonthData()
      }, 30_000)
    }
    function stopPolling() {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
    }
    function handleVisibility() {
      if (document.hidden) stopPolling()
      else { fetchMonthData(); startPolling() }
    }
    startPolling()
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibility)
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
    // 시작일 유지 — 월을 넘겨서 범위 선택 가능 (4/7 → 5월로 이동 → 5/7 클릭 = 4/7~5/7)
  }

  function handleNextMonth() {
    if (!canGoNext) return
    if (currentMonth === 11) {
      setCurrentYear((y) => y + 1)
      setCurrentMonth(0)
    } else {
      setCurrentMonth((m) => m + 1)
    }
  }

  function handleSelectDate(dateStr: string) {
    const next = new Set(selectedDates)
    if (next.has(dateStr)) next.delete(dateStr)
    else next.add(dateStr)

    setSelectedDates(next)

    if (next.size === 0) {
      setSelectedStart(null)
      setSelectedEnd(null)
    } else {
      const sorted = [...next].sort()
      setSelectedStart(sorted[0])
      setSelectedEnd(sorted.length > 1 ? sorted[sorted.length - 1] : null)
    }

    if (selectedCourseId) {
      setSelectedCourseId(null)
      if (timeFilterSource === "course-auto") {
        setTimeFilter("all")
        setTimeFilterSource("default")
      }
    }
  }

  function handleStartDateChange(dateStr: string) {
    setSelectedStart(dateStr || null)
    if (dateStr) {
      const d = new Date(dateStr + "T12:00:00Z")
      setCurrentYear(d.getUTCFullYear())
      setCurrentMonth(d.getUTCMonth())
    }
    setSelectedDates(new Set())
    if (selectedCourseId) {
      setSelectedCourseId(null)
      if (timeFilterSource === "course-auto") {
        setTimeFilter("all")
        setTimeFilterSource("default")
      }
    }
  }

  function handleEndDateChange(dateStr: string) {
    setSelectedEnd(dateStr || null)
    setSelectedDates(new Set())
    if (selectedCourseId) {
      setSelectedCourseId(null)
      if (timeFilterSource === "course-auto") {
        setTimeFilter("all")
        setTimeFilterSource("default")
      }
    }
  }

  function handleWeekdaysOnly() {
    const todayStr = formatDate(new Date())
    let rangeStart: string
    let rangeEnd: string

    if (selectedStart && selectedEnd) {
      rangeStart = selectedStart < todayStr ? todayStr : selectedStart
      rangeEnd = selectedEnd
    } else {
      const firstDay = new Date(currentYear, currentMonth, 1)
      const lastDay = new Date(currentYear, currentMonth + 1, 0)
      rangeStart = formatDate(firstDay) < todayStr ? todayStr : formatDate(firstDay)
      rangeEnd = formatDate(lastDay)
      setSelectedStart(rangeStart)
      setSelectedEnd(rangeEnd)
    }

    if (rangeStart > rangeEnd) return

    const weekdays = new Set<string>()
    const cursor = new Date(rangeStart + "T12:00:00Z")
    const limit = new Date(rangeEnd + "T12:00:00Z")
    while (cursor <= limit) {
      const dateStr = cursor.toISOString().slice(0, 10)
      const dow = cursor.getUTCDay()
      if (!isOff(dateStr, dow)) {
        weekdays.add(dateStr)
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }

    setSelectedDates(weekdays)
    if (selectedCourseId) {
      setSelectedCourseId(null)
      if (timeFilterSource === "course-auto") {
        setTimeFilter("all")
        setTimeFilterSource("default")
      }
    }
  }

  function handleTimeFilterChange(filter: string) {
    const normalized = normalizeTimeFilter(filter)
    setTimeFilter(normalized)
    setTimeFilterSource(selectedCourseId ? "manual" : normalized === "all" ? "default" : "manual")
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
    setSelectedCourseId(null)
    setSelectedStart(formatDate(today))
    setSelectedEnd(null)
    setSelectedDates(new Set())
    setTimeFilter("all")
    setTimeFilterSource("default")
  }

  function handleReset() {
    setSelectedCourseId(null)
    setSelectedStart(null)
    setSelectedEnd(null)
    setSelectedDates(new Set())
    setCoaches([])
    setTimeFilter("all")
    setTimeFilterSource("default")
  }

  function handleStatusRefresh() {
    fetchStatusData()
    fetchMonthData()
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
          selectedDates={selectedDates.size > 0 ? selectedDates : undefined}
          monthData={monthData}
          onSelectDate={handleSelectDate}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
          canGoPrev={canGoPrev}
          canGoNext={canGoNext}
          onToday={handleToday}
          onRefresh={handleSyncAndRefresh}
          onReset={handleReset}
          syncing={syncing}
          timeFilter={timeFilter}
          onTimeFilterChange={handleTimeFilterChange}
          timeFilterBadgeLabel={timeFilterBadgeLabel}
          timeFilterHelper={timeFilterHelper}
          onStartDateChange={handleStartDateChange}
          onEndDateChange={handleEndDateChange}
          onWeekdaysOnly={handleWeekdaysOnly}
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
          courses={courses}
          selectedCourseId={selectedCourseId}
          onCourseChange={(id) => {
            setSelectedCourseId(id)
            if (id) {
              const course = courses.find((c) => c.id === id)
              const autoFilter = inferCourseTimeFilter(course ?? null)
              const courseDates = parseCourseTimeRanges(course?.workHours).map((timeRange) => timeRange.date).sort()
              const rangeStart = course?.startDate?.slice(0, 10) || courseDates[0] || null
              const rangeEnd = course?.endDate?.slice(0, 10) || courseDates[courseDates.length - 1] || rangeStart
              setTimeFilter(autoFilter.filter)
              setTimeFilterSource("course-auto")
              if (rangeStart && rangeEnd) {
                const start = new Date(rangeStart + "T12:00:00Z")
                setCurrentYear(start.getUTCFullYear())
                setCurrentMonth(start.getUTCMonth())
                setSelectedStart(rangeStart)
                setSelectedEnd(rangeEnd)
                // 기존 선택 날짜 유지 > workHours 날짜 > 전체 고용기간
                if (selectedDates.size === 0) {
                  setSelectedDates(courseDates.length > 0 ? new Set(courseDates) : buildDateSet(rangeStart, rangeEnd))
                }
              } else {
                setSelectedStart(null)
                setSelectedEnd(null)
                setSelectedDates(new Set())
              }
            } else {
              setSelectedDates(new Set())
              if (timeFilterSource === "course-auto") {
                setTimeFilter("all")
                setTimeFilterSource("default")
              }
            }
          }}
          onReset={handleReset}
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
