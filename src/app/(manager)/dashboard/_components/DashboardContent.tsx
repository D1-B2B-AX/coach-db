"use client"

import { useState, useEffect, useCallback, useRef } from "react"

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

export default function DashboardContent({ variant }: DashboardContentProps) {
  const now = new Date()
  const [currentYear, setCurrentYear] = useState(now.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(now.getMonth())
  const [selectedStart, setSelectedStart] = useState<string | null>(null)
  const [selectedEnd, setSelectedEnd] = useState<string | null>(null)
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  const [monthData, setMonthData] = useState<Record<string, number>>({})
  const [coaches, setCoaches] = useState<CoachEntry[]>([])
  const [scoutedCoachIds, setScoutedCoachIds] = useState<Set<string>>(new Set())
  const [statusData, setStatusData] = useState<StatusData | null>(null)
  const [timeFilter, setTimeFilter] = useState<string>("08-13,13-18")

  // For API calls: compute broadest time range from multi-select
  function getApiTimeFilter(): string {
    if (timeFilter === "all") return "all"
    const ranges = timeFilter.split(",")
    let minS = 24, maxE = 0
    for (const r of ranges) {
      const [s, e] = r.split("-").map(Number)
      if (s < minS) minS = s
      if (e > maxE) maxE = e
    }
    return `${String(minS).padStart(2, "0")}-${String(maxE).padStart(2, "0")}`
  }
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
  const [bulkCourseName, setBulkCourseName] = useState("")
  const [bulkCourseDescription, setBulkCourseDescription] = useState("")
  const [bulkSending, setBulkSending] = useState(false)
  const [bulkError, setBulkError] = useState("")

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const yearMonth = formatYearMonth(currentYear, currentMonth)

  // Fetch month summary data
  const fetchMonthData = useCallback(async () => {
    setMonthLoading(true)
    try {
      const params = new URLSearchParams()
      const apiTime = getApiTimeFilter()
      if (apiTime !== "all") {
        params.set("timeFilter", apiTime)
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
      const apiTime = getApiTimeFilter()
      if (apiTime !== "all") {
        params.set("timeFilter", apiTime)
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

  // Fetch courses for the manager
  const fetchCourses = useCallback(async () => {
    try {
      const res = await fetch("/api/courses")
      if (res.ok) {
        const data = await res.json()
        setCourses((data.courses || []).map((c: { id: string; name: string; startDate: string | null; endDate: string | null }) => ({
          id: c.id, name: c.name, startDate: c.startDate, endDate: c.endDate,
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
    setTimeFilter("all")
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
    setSelectedStart(null)
    setSelectedEnd(null)
    setTimeFilter("all")
  }

  function handleStatusRefresh() {
    fetchStatusData()
    fetchMonthData()
  }

  // 선택된 날짜 범위의 모든 날짜 생성
  function getSelectedDateRange(): string[] {
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
    const selectedCourse = selectedCourseId
      ? courses.find((c) => c.id === selectedCourseId)
      : null
    setBulkCoachIds(coachIds)
    setBulkCourseName(selectedCourse?.name ?? "")
    setBulkCourseDescription("")
    setBulkError("")
    setShowScoutModal(true)
  }

  // 팝업 입력값으로 여러 코치를 선택된 날짜 범위에 일괄 컨택
  async function submitBulkScout() {
    if (bulkCoachIds.length === 0 || !selectedStart) return
    const courseName = bulkCourseName.trim()
    if (!courseName) {
      setBulkError("과정명을 입력해주세요.")
      return
    }
    const dates = getSelectedDateRange()
    setBulkSending(true)
    setBulkError("")
    try {
      let successCount = 0
      let failedCount = 0
      for (const coachId of bulkCoachIds) {
        for (const date of dates) {
          const res = await fetch('/api/scoutings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              coachId,
              date,
              mode: 'upsert',
              courseName,
              note: bulkCourseDescription.trim() || undefined,
              ...(selectedCourseId && { courseId: selectedCourseId }),
            }),
          })
          if (res.ok) successCount++
          else failedCount++
        }
      }
      // 섭외된 코치 목록 갱신
      setScoutedCoachIds((prev) => {
        const next = new Set(prev)
        for (const id of bulkCoachIds) next.add(id)
        return next
      })
      setToastMessage(
        `${bulkCoachIds.length}명 × ${dates.length}일 컨택 완료 (${successCount}건${failedCount > 0 ? `, 실패 ${failedCount}건` : ''})`
      )
      setShowToast(true)
      if (failedCount === 0) {
        setShowScoutModal(false)
      } else {
        setBulkError("일부 전송에 실패했습니다. 다시 시도해주세요.")
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

  return (
    <div className="mx-auto max-w-6xl overflow-x-hidden px-4 py-6 sm:px-6">
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
          onBulkScout={openBulkScoutModal}
          courses={courses}
          selectedCourseId={selectedCourseId}
          onCourseChange={(id) => {
            setSelectedCourseId(id)
            if (id) {
              const course = courses.find((c) => c.id === id)
              if (course?.startDate) {
                const sd = course.startDate.slice(0, 10)
                const ed = course.endDate?.slice(0, 10) || sd
                const start = new Date(sd + "T12:00:00Z")
                setCurrentYear(start.getUTCFullYear())
                setCurrentMonth(start.getUTCMonth())
                setSelectedStart(sd)
                setSelectedEnd(ed)
                // 과정 범위 내 모든 날짜를 selectedDates에 채움
                setSelectedDates(buildDateSet(sd, ed))
              }
            } else {
              setSelectedDates(new Set())
            }
          }}
          onCourseCreate={(course) => setCourses((prev) => [course, ...prev])}
          onReset={handleReset}
        />
      </div>

      {showScoutModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => !bulkSending && setShowScoutModal(false)}
        >
          <div
            className="w-full max-w-[420px] rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-[#333]">컨택 내용 확인</h3>
            <p className="mt-1 text-xs text-gray-500">
              선택된 코치 {bulkCoachIds.length}명 / {getSelectedDateRange().length}일
            </p>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">과정명</span>
                <input
                  type="text"
                  value={bulkCourseName}
                  onChange={(e) => setBulkCourseName(e.target.value)}
                  placeholder="과정명을 입력하세요"
                  maxLength={200}
                  disabled={bulkSending}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-[#333] focus:border-[#1976D2] focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">과정설명</span>
                <textarea
                  value={bulkCourseDescription}
                  onChange={(e) => setBulkCourseDescription(e.target.value)}
                  placeholder="실습코치에게 전달할 설명을 입력하세요"
                  maxLength={1000}
                  rows={4}
                  disabled={bulkSending}
                  className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-[#333] focus:border-[#1976D2] focus:outline-none"
                />
              </label>
              {bulkError && <p className="text-xs text-red-600">{bulkError}</p>}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowScoutModal(false)}
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
