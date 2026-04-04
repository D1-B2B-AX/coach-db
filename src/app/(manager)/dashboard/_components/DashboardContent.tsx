"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"

import DashboardCalendar from "@/components/dashboard/DashboardCalendar"
import DashboardCoachList from "@/components/dashboard/DashboardCoachList"
import Toast from "@/components/Toast"
import type { CourseOption } from "@/components/CourseSelector"

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
  const [scoutingManagers, setScoutingManagers] = useState<Record<string, string>>({})
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
  const [showScoutModal, setShowScoutModal] = useState(false)
  const [bulkCoachIds, setBulkCoachIds] = useState<string[]>([])
  const [bulkDates, setBulkDates] = useState<string[]>([])
  const [bulkCourseName, setBulkCourseName] = useState("")
  const [bulkCourseDescription, setBulkCourseDescription] = useState("")
  const [bulkRemark, setBulkRemark] = useState("")
  const [bulkMessage, setBulkMessage] = useState("")
  const [bulkSending, setBulkSending] = useState(false)
  const [bulkError, setBulkError] = useState("")

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const yearMonth = formatYearMonth(currentYear, currentMonth)
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
      setScoutingManagers({})
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
        const mapping: Record<string, string> = {}
        for (const s of (data.scoutings || [])) {
          if (s.status === 'cancelled') continue
          const coachId = s.coachId
          if (!coachId) continue
          const managerName = (s.manager?.name || '').trim() || '매니저'
          const existing = mapping[coachId]
          if (existing) {
            if (!existing.includes(managerName)) {
              mapping[coachId] = `${existing}, ${managerName}`
            }
          } else {
            mapping[coachId] = managerName
          }
        }
        setScoutingManagers(mapping)
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
    if (selectedCourseId && selectedStart && selectedEnd) {
      if (dateStr >= selectedStart && dateStr <= selectedEnd) {
        setSelectedDates((prev) => {
          const next = new Set(prev)
          if (next.has(dateStr)) next.delete(dateStr)
          else next.add(dateStr)
          return next
        })
        return
      }
      setSelectedCourseId(null)
      setSelectedDates(new Set())
      if (timeFilterSource === "course-auto") {
        setTimeFilter("all")
        setTimeFilterSource("default")
      }
    }
    // 이미 선택된 날짜를 다시 누르면 선택 해제
    if (dateStr === selectedStart && !selectedEnd) {
      setSelectedStart(null)
      return
    }
    // 시작일이 있고 종료일이 없으면 → 범위 종료 설정
    if (selectedStart && !selectedEnd && dateStr > selectedStart) {
      setSelectedEnd(dateStr)
    } else {
      setSelectedStart(dateStr)
      setSelectedEnd(null)
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

  // 선택된 날짜 범위의 모든 날짜 생성
  function getSelectedDateRange(): string[] {
    if (selectedCourseId && selectedDates.size > 0) {
      return [...selectedDates].sort()
    }
    if (!selectedStart) return []
    if (!selectedEnd) return [selectedStart]
    const dates: string[] = []
    const cursor = new Date(selectedStart + "T12:00:00Z")
    const end = new Date(selectedEnd + "T12:00:00Z")
    while (cursor <= end) {
      dates.push(cursor.toISOString().slice(0, 10))
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    return dates
  }

  function openBulkScoutModal(coachIds: string[]) {
    if (coachIds.length === 0 || !selectedStart) return
    if (!selectedCourseId) {
      alert("과정을 먼저 선택해주세요.")
      return
    }
    const selectedCourse = courses.find((c) => c.id === selectedCourseId)
    setBulkCoachIds(coachIds)
    setBulkDates(getSelectedDateRange())
    setBulkCourseName(selectedCourse?.name ?? "")
    setBulkCourseDescription(selectedCourse?.description ?? "")
    setBulkRemark("")
    setBulkMessage("")
    setBulkError("")
    setBulkSending(false)
    setShowScoutModal(true)
  }

  function closeBulkModal() {
    setShowScoutModal(false)
    setBulkCoachIds([])
    setBulkDates([])
    setBulkCourseName("")
    setBulkCourseDescription("")
    setBulkRemark("")
    setBulkMessage("")
    setBulkError("")
    setBulkSending(false)
  }

  // 팝업 입력값으로 여러 코치를 선택된 날짜 범위에 일괄 컨택
  async function submitBulkScout() {
    if (bulkCoachIds.length === 0 || !selectedStart) return
    const courseName = bulkCourseName.trim()
    if (!courseName) {
      setBulkError("과정명을 입력해주세요.")
      return
    }
    // Parse workHours to extract per-date times
    const selectedCourse = courses.find(c => c.id === selectedCourseId)
    const workHoursMap = new Map<string, { start: string; end: string }>()
    if (selectedCourse?.workHours) {
      for (const line of selectedCourse.workHours.split("\n")) {
        const m = line.match(/^(\d{4}-\d{2}-\d{2})\(.+?\)\s+(\d{2}:\d{2})-(\d{2}:\d{2})/)
        if (m) workHoursMap.set(m[1], { start: m[2], end: m[3] })
      }
    }

    const dates = bulkDates
    setBulkSending(true)
    setBulkError("")
    try {
      let successCount = 0
      let failedCount = 0
      let firstErrorMessage = ""
      for (const coachId of bulkCoachIds) {
        for (const date of dates) {
          const dateTime = workHoursMap.get(date)
          const res = await fetch('/api/scoutings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                coachId,
                date,
                mode: 'upsert',
                courseName,
                courseDescription: bulkCourseDescription.trim() || undefined,
                message: bulkMessage.trim() || undefined,
                hireStart: dateTime?.start || undefined,
                hireEnd: dateTime?.end || undefined,
                ...(selectedCourseId && { courseId: selectedCourseId }),
              }),
            })
          if (res.ok) {
            successCount++
            continue
          }

          const data = await res.json().catch(() => ({}))
          const errorMessage = typeof data?.error === "string" ? data.error : `${res.status} ${res.statusText}`
          if (!firstErrorMessage) firstErrorMessage = errorMessage
          console.error("[submitBulkScout] POST /api/scoutings failed", { coachId, date, status: res.status, errorMessage, data })
          failedCount++
        }
      }
      // 섭외된 코치 목록 갱신 (다시 가져오기)
      await fetchCoaches()
      setToastMessage(
        `${bulkCoachIds.length}명 × ${dates.length}일 컨택 완료 (${successCount}건${failedCount > 0 ? `, 실패 ${failedCount}건` : ''})`
      )
      setShowToast(true)
      if (failedCount === 0) {
        closeBulkModal()
      } else {
        setBulkError(firstErrorMessage || "일부 전송에 실패했습니다. 다시 시도해주세요.")
      }
    } catch (e) {
      console.error('일괄 컨택 에러:', e)
      setToastMessage('컨택 처리 중 네트워크 오류')
      setShowToast(true)
      setBulkError("전송 중 오류가 발생했습니다.")
    } finally {
      setBulkSending(false)
    }
  }

  const [noCoursesDismissed, setNoCoursesDismissed] = useState(false)

  return (
    <div className="mx-auto max-w-6xl overflow-x-hidden px-4 py-6 sm:px-6">
      {/* No courses prompt */}
      {courses.length === 0 && !noCoursesDismissed && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-[#BBDEFB] bg-[#E3F2FD] px-4 py-3">
          <div className="text-sm text-[#1565C0]">
            과정이 아직 없습니다. 나의 과정에서 과정을 먼저 만들어주세요.
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href="/mypage?tab=courses"
              className="rounded-lg bg-[#1976D2] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1565C0] transition-colors"
            >
              나의 과정로 이동
            </a>
            <button
              onClick={() => setNoCoursesDismissed(true)}
              className="cursor-pointer text-xs text-[#90CAF9] hover:text-[#1565C0] transition-colors"
            >
              닫기
            </button>
          </div>
        </div>
      )}
      {/* Main content: calendar + coach list */}
      <div className="grid min-w-0 gap-5 md:grid-cols-[340px_1fr] lg:grid-cols-[380px_1fr]">
        <DashboardCalendar
          year={currentYear}
          month={currentMonth}
          selectedStart={selectedStart}
          selectedEnd={selectedEnd}
          selectedDates={selectedCourseId ? selectedDates : undefined}
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
          scoutingManagers={scoutingManagers}
          onBulkScout={openBulkScoutModal}
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

      {showScoutModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => !bulkSending && closeBulkModal()}
        >
          <div
            className="w-full max-w-[calc(100vw-2rem)] sm:max-w-[420px] rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-[#333]">컨택 내용 확인</h3>
            <p className="mt-1 text-xs text-gray-500">
              선택된 코치 {bulkCoachIds.length}명 / {bulkDates.length}일
            </p>
            <div className="mt-4 space-y-3">
              {/* 과정 정보 — 과정에서 가져오되 편집 가능 */}
              <div>
                <span className="mb-1 block text-xs font-medium text-gray-600">과정명</span>
                <input
                  type="text"
                  value={bulkCourseName}
                  onChange={(e) => setBulkCourseName(e.target.value)}
                  maxLength={200}
                  disabled={bulkSending}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-[#333] focus:border-[#1976D2] focus:outline-none"
                />
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium text-gray-600">과정설명</span>
                <textarea
                  value={bulkCourseDescription}
                  onChange={(e) => setBulkCourseDescription(e.target.value)}
                  placeholder="코치에게 전달할 설명을 입력하세요"
                  rows={3}
                  disabled={bulkSending}
                  className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-[#333] focus:border-[#1976D2] focus:outline-none"
                />
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium text-gray-600">함께 전하는 말</span>
                <textarea
                  value={bulkMessage}
                  onChange={(e) => setBulkMessage(e.target.value)}
                  placeholder="코치에게 따로 전할 말이 있으면 입력하세요"
                  rows={2}
                  disabled={bulkSending}
                  className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-[#333] focus:border-[#1976D2] focus:outline-none"
                />
              </div>

              {bulkError && <p className="text-xs text-red-600">{bulkError}</p>}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => closeBulkModal()}
                disabled={bulkSending}
                className="cursor-pointer rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitBulkScout}
                disabled={bulkSending}
                className="cursor-pointer rounded-lg bg-[#1976D2] px-3 py-2 text-sm font-medium text-white hover:bg-[#1565C0] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bulkSending ? "전송 중..." : "전송"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast
        message={toastMessage}
        show={showToast}
        onClose={() => setShowToast(false)}
      />
    </div>
  )
}
