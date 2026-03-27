"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import CoachHeader from "@/components/coach/CoachHeader"
import ScheduleCalendar from "@/components/coach/ScheduleCalendar"
import TimePanel, { ALL_SLOTS } from "@/components/coach/TimePanel"
import ScheduleSummary from "@/components/coach/ScheduleSummary"
import SaveButton from "@/components/coach/SaveButton"
import CoachProfileEdit from "@/components/coach/CoachProfileEdit"

// ─── Types ───────────────────────────────────────────────────────

interface CoachInfo {
  id: string
  name: string
  status: string
  phone: string | null
  workType: string | null
  availabilityDetail: string | null
  selfNote: string | null
  fields: { id: string; name: string }[]
  curriculums: { id: string; name: string }[]
}

interface ScheduleSlot {
  id: string
  date: string // YYYY-MM-DD
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
  location: string | null
  status: string
}

// ─── Helpers ─────────────────────────────────────────────────────

/** Convert API schedule ranges → Map<dateKey, Set<halfHourSlot>> */
function schedulesToSlotMap(schedules: ScheduleSlot[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const s of schedules) {
    if (!map.has(s.date)) map.set(s.date, new Set())
    const set = map.get(s.date)!
    // Expand range into 30-min slots
    const [startH, startM] = s.startTime.split(":").map(Number)
    const [endH, endM] = s.endTime.split(":").map(Number)
    let h = startH
    let m = startM
    while (h < endH || (h === endH && m < endM)) {
      const slotKey = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
      if (ALL_SLOTS.includes(slotKey)) {
        set.add(slotKey)
      }
      m += 30
      if (m >= 60) {
        h += 1
        m = 0
      }
    }
  }
  return map
}

/** Convert Map<dateKey, Set<halfHourSlot>> → API slots array (grouped consecutive ranges) */
function slotMapToApiSlots(
  map: Map<string, Set<string>>
): Array<{ date: string; startTime: string; endTime: string }> {
  const result: Array<{ date: string; startTime: string; endTime: string }> = []

  for (const [date, slotSet] of map) {
    if (slotSet.size === 0) continue
    const sorted = [...slotSet].sort()

    let rangeStart = sorted[0]
    let prev = sorted[0]

    for (let i = 1; i < sorted.length; i++) {
      const prevIdx = ALL_SLOTS.indexOf(prev)
      const curIdx = ALL_SLOTS.indexOf(sorted[i])
      if (curIdx === prevIdx + 1) {
        prev = sorted[i]
      } else {
        result.push({ date, startTime: rangeStart, endTime: endOfSlot(prev) })
        rangeStart = sorted[i]
        prev = sorted[i]
      }
    }
    result.push({ date, startTime: rangeStart, endTime: endOfSlot(prev) })
  }

  return result
}

function endOfSlot(slot: string): string {
  const [hStr, mStr] = slot.split(":")
  const h = parseInt(hStr)
  const m = parseInt(mStr)
  let endH = h
  let endM = m + 30
  if (endM >= 60) {
    endH += 1
    endM = 0
  }
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`
}

/** Build a set of date keys (YYYY-MM-DD) that have confirmed engagements
 *  Only includes dates that have actual schedule entries within an engagement range */
function engagementsToConfirmedDates(
  engagements: Engagement[],
  scheduleDates: Set<string>
): Set<string> {
  const set = new Set<string>()
  for (const dateKey of scheduleDates) {
    const d = new Date(dateKey + "T00:00:00")
    for (const e of engagements) {
      if (e.status !== "scheduled" && e.status !== "in_progress") continue
      const start = new Date(e.startDate)
      const end = new Date(e.endDate)
      if (d >= start && d <= end) {
        set.add(dateKey)
        break
      }
    }
  }
  return set
}

/** Build Map<dateKey, Set<slotKey>> for confirmed engagement time slots.
 *  Only includes dates that have actual schedule entries within an engagement range */
function engagementsToConfirmedSlots(
  engagements: Engagement[],
  scheduleDates: Set<string>
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const dateKey of scheduleDates) {
    const d = new Date(dateKey + "T00:00:00")
    for (const e of engagements) {
      if (e.status !== "scheduled" && e.status !== "in_progress") continue
      if (!e.startTime || !e.endTime) continue
      const start = new Date(e.startDate)
      const end = new Date(e.endDate)
      if (d >= start && d <= end) {
        if (!map.has(dateKey)) map.set(dateKey, new Set())
        const set = map.get(dateKey)!
        // Expand time range
        const [sh, sm] = e.startTime!.split(":").map(Number)
        const [eh, em] = e.endTime!.split(":").map(Number)
        let h = sh
        let m = sm
        while (h < eh || (h === eh && m < em)) {
          const slotKey = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
          if (ALL_SLOTS.includes(slotKey)) {
            set.add(slotKey)
          }
          m += 30
          if (m >= 60) {
            h += 1
            m = 0
          }
        }
      }
    }
  }
  return map
}

function yearMonthStr(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`
}

/** Deep copy a Map<string, Set<string>> so inner Sets are independent */
function deepCopySlotMap(map: Map<string, Set<string>>): Map<string, Set<string>> {
  const copy = new Map<string, Set<string>>()
  for (const [key, set] of map) {
    copy.set(key, new Set(set))
  }
  return copy
}

// ─── Component ───────────────────────────────────────────────────

export default function CoachSchedulePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#f5f5f5]">
          <div className="text-[#999]">로딩 중...</div>
        </div>
      }
    >
      <CoachScheduleContent />
    </Suspense>
  )
}

function CoachScheduleContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")

  // Core state
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth()) // 0-based
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedDayNum, setSelectedDayNum] = useState<number>(0)

  // Data from API
  const [coachInfo, setCoachInfo] = useState<CoachInfo | null>(null)
  const [schedules, setSchedules] = useState<Map<string, Set<string>>>(new Map())
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)

  // Editing state — working copy that only modifies the "available" slots
  const [editingSlots, setEditingSlots] = useState<Map<string, Set<string>>>(new Map())

  // UI state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  // Only current month and next month are editable
  const isEditable = useMemo(() => {
    const now = new Date()
    const currentYM = now.getFullYear() * 12 + now.getMonth()
    const viewingYM = currentYear * 12 + currentMonth
    return viewingYM >= currentYM && viewingYM <= currentYM + 1
  }, [currentYear, currentMonth])

  // Derived: all dates that have schedule entries (for cross-referencing with engagements)
  const allScheduleDates = useMemo(() => {
    const set = new Set<string>()
    for (const [key, slots] of schedules) {
      if (slots.size > 0) set.add(key)
    }
    return set
  }, [schedules])

  // Derived: confirmed data (only dates with actual schedule entries within engagement ranges)
  const confirmedDates = useMemo(
    () => engagementsToConfirmedDates(engagements, allScheduleDates),
    [engagements, allScheduleDates]
  )
  const confirmedSlotsMap = useMemo(
    () => engagementsToConfirmedSlots(engagements, allScheduleDates),
    [engagements, allScheduleDates]
  )

  // Derived: available dates (from editing slots)
  const availableDates = useMemo(() => {
    const set = new Set<string>()
    for (const [key, slots] of editingSlots) {
      if (slots.size > 0) set.add(key)
    }
    return set
  }, [editingSlots])

  // ─── API calls ──────────────────────────────────────────────────

  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }),
    [token]
  )

  const fetchCoachInfo = useCallback(async () => {
    const res = await fetch("/api/coach/me", { headers })
    if (!res.ok) throw new Error("Failed to fetch coach info")
    return (await res.json()) as CoachInfo
  }, [headers])

  const fetchSchedule = useCallback(
    async (ym: string) => {
      const res = await fetch(`/api/coach/schedule/${ym}`, { headers })
      if (!res.ok) throw new Error("Failed to fetch schedule")
      return (await res.json()) as {
        schedules: ScheduleSlot[]
        engagements: Engagement[]
        lastSavedAt: string | null
      }
    },
    [headers]
  )

  // ─── Initial load ───────────────────────────────────────────────

  useEffect(() => {
    if (!token) {
      setError("인증 토큰이 필요합니다")
      setLoading(false)
      return
    }

    async function load() {
      try {
        setLoading(true)
        const ym = yearMonthStr(currentYear, currentMonth)
        const [coach, scheduleData] = await Promise.all([
          fetchCoachInfo(),
          fetchSchedule(ym),
        ])
        setCoachInfo(coach)

        const slotMap = schedulesToSlotMap(scheduleData.schedules)
        setSchedules(slotMap)
        setEditingSlots(deepCopySlotMap(slotMap)) // deep copy
        setEngagements(scheduleData.engagements)
        setLastSavedAt(scheduleData.lastSavedAt)
        setError(null)
      } catch (e: any) {
        setError(e.message || "데이터를 불러오는 중 오류가 발생했습니다")
      } finally {
        setLoading(false)
      }
    }

    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // ─── Month navigation ──────────────────────────────────────────

  const changeMonth = useCallback(
    async (dir: number) => {
      let newMonth = currentMonth + dir
      let newYear = currentYear
      if (newMonth > 11) {
        newMonth = 0
        newYear++
      }
      if (newMonth < 0) {
        newMonth = 11
        newYear--
      }

      setSelectedDay(null)
      setCurrentYear(newYear)
      setCurrentMonth(newMonth)
      setSaved(false)

      // Fetch new month's schedule
      try {
        const ym = yearMonthStr(newYear, newMonth)
        const data = await fetchSchedule(ym)
        const slotMap = schedulesToSlotMap(data.schedules)
        setSchedules(slotMap)
        setEditingSlots(deepCopySlotMap(slotMap))
        setEngagements(data.engagements)
        setLastSavedAt(data.lastSavedAt)
      } catch {
        showToast("일정을 불러오지 못했습니다")
      }
    },
    [currentYear, currentMonth, fetchSchedule]
  )

  // ─── Day selection ──────────────────────────────────────────────

  const handleSelectDay = useCallback(
    (dateKey: string, day: number) => {
      if (selectedDay === dateKey) {
        // Deselect
        setSelectedDay(null)
        return
      }
      setSelectedDay(dateKey)
      setSelectedDayNum(day)

      // Ensure the editing slots has an entry for this day
      setEditingSlots((prev) => {
        if (!prev.has(dateKey)) {
          const next = new Map(prev)
          next.set(dateKey, new Set())
          return next
        }
        return prev
      })
    },
    [selectedDay]
  )

  const handleConfirmedClick = useCallback(
    (dateKey: string) => {
      if (selectedDay === dateKey) {
        setSelectedDay(null)
        return
      }
      // Open time panel in read-only mode to show confirmed info
      const day = parseInt(dateKey.split("-")[2])
      setSelectedDay(dateKey)
      setSelectedDayNum(day)
    },
    [selectedDay]
  )

  // ─── Time slot editing ─────────────────────────────────────────

  const handleToggleSlot = useCallback(
    (slot: string) => {
      if (!selectedDay) return
      setEditingSlots((prev) => {
        const next = new Map(prev)
        const daySlots = new Set(next.get(selectedDay) ?? [])
        if (daySlots.has(slot)) {
          daySlots.delete(slot)
        } else {
          daySlots.add(slot)
        }
        next.set(selectedDay, daySlots)
        return next
      })
    },
    [selectedDay]
  )

  const handleSelectAll = useCallback(() => {
    if (!selectedDay) return
    const confirmed = confirmedSlotsMap.get(selectedDay) ?? new Set()
    setEditingSlots((prev) => {
      const next = new Map(prev)
      const daySlots = new Set(next.get(selectedDay) ?? [])
      for (const s of ALL_SLOTS) {
        if (!confirmed.has(s)) daySlots.add(s)
      }
      next.set(selectedDay, daySlots)
      return next
    })
  }, [selectedDay, confirmedSlotsMap])

  const handleClear = useCallback(() => {
    if (!selectedDay) return
    setEditingSlots((prev) => {
      const next = new Map(prev)
      next.set(selectedDay, new Set())
      return next
    })
  }, [selectedDay])

  // ─── Save ───────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    const ym = yearMonthStr(currentYear, currentMonth)
    const apiSlots = slotMapToApiSlots(editingSlots)

    // Filter to only include slots for the current month
    const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`
    const monthSlots = apiSlots.filter((s) => s.date.startsWith(monthPrefix))

    setSaving(true)
    try {
      const res = await fetch(`/api/coach/schedule/${ym}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ slots: monthSlots }),
      })
      if (!res.ok) throw new Error("Save failed")

      setLastSavedAt(new Date().toISOString())
      setSaved(true)
      showToast("저장되었습니다!")
    } catch {
      showToast("저장에 실패했습니다. 다시 시도해주세요.")
    } finally {
      setSaving(false)
    }
  }, [currentYear, currentMonth, editingSlots, headers])

  // ─── Toast ──────────────────────────────────────────────────────

  function showToast(msg: string) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 2500)
  }

  // ─── Exit ───────────────────────────────────────────────────────

  const handleExit = useCallback(() => {
    if (window.confirm("나가시겠습니까? 저장하지 않은 변경사항은 사라집니다.")) {
      window.close()
    }
  }, [])

  // ─── Saved stats ────────────────────────────────────────────────

  const savedDayCount = useMemo(() => {
    let count = 0
    const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`
    for (const [key, slots] of editingSlots) {
      if (key.startsWith(monthPrefix) && slots.size > 0) count++
    }
    return count
  }, [editingSlots, currentYear, currentMonth])

  const savedTotalHours = useMemo(() => {
    let totalSlots = 0
    const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`
    for (const [key, slots] of editingSlots) {
      if (key.startsWith(monthPrefix)) totalSlots += slots.size
    }
    return totalSlots * 0.5
  }, [editingSlots, currentYear, currentMonth])

  // ─── Render ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f5f5]">
        <div className="text-[#999]">일정을 불러오는 중...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f5f5]">
        <div className="rounded-2xl bg-white p-8 text-center shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
          <div className="mb-2 text-lg font-semibold text-red-600">오류</div>
          <div className="text-base text-[#666]">{error}</div>
        </div>
      </div>
    )
  }

  // Currently selected day's slots (for time panel)
  const currentDaySlots = selectedDay
    ? editingSlots.get(selectedDay) ?? new Set<string>()
    : new Set<string>()
  const currentDayConfirmed = selectedDay
    ? confirmedSlotsMap.get(selectedDay) ?? new Set<string>()
    : new Set<string>()

  const [coachTab, setCoachTab] = useState<"schedule" | "profile">("schedule")
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [phoneInput, setPhoneInput] = useState("")
  const [phoneError, setPhoneError] = useState("")

  return (
    <div className="flex min-h-screen justify-center bg-[#f5f5f5] p-5 max-md:p-2.5">
      <div className="flex w-full max-w-[800px] items-start gap-6 max-md:flex-col max-md:items-center">
        {/* Main container */}
        <div className="w-[480px] overflow-hidden rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] max-md:w-full max-md:max-w-[480px]">
          <CoachHeader
            coachName={coachInfo?.name ?? ""}
            month={currentMonth + 1}
            lastSavedAt={lastSavedAt}
            onExit={handleExit}
          />

          {/* Tabs */}
          <div className="flex border-b border-gray-200 px-7">
            {([
              { key: "schedule" as const, label: "스케줄" },
              { key: "profile" as const, label: "프로필" },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setCoachTab(tab.key)}
                className={`cursor-pointer border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  coachTab === tab.key
                    ? "border-[#1976D2] text-[#1976D2]"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {coachTab === "schedule" && (
          <div className="px-7 pt-5 pb-7">
            <ScheduleCalendar
              year={currentYear}
              month={currentMonth}
              selectedDay={selectedDay}
              availableDates={availableDates}
              confirmedDates={confirmedDates}
              onSelectDay={handleSelectDay}
              onConfirmedClick={handleConfirmedClick}
              onPrevMonth={() => changeMonth(-1)}
              onNextMonth={() => changeMonth(1)}
            />

            {/* Day count */}
            <div className="mt-4 text-center text-sm text-[#666]">
              {savedDayCount > 0 ? (
                <>
                  <span className="font-semibold text-[#2E7D32]">{savedDayCount}일</span> 선택됨
                </>
              ) : (
                '날짜를 클릭하여 가능한 일정을 선택해주세요'
              )}
            </div>

            <ScheduleSummary engagements={engagements} />
          </div>
          )}

          {coachTab === "profile" && (
          <div className="px-7 pt-5 pb-7">
            {!phoneVerified && coachInfo?.phone ? (
              <div className="py-8">
                <p className="text-center text-sm text-gray-500">본인 확인을 위해 연락처를 입력해주세요</p>
                <input
                  type="text"
                  value={phoneInput}
                  onChange={(e) => { setPhoneInput(e.target.value); setPhoneError("") }}
                  placeholder="010-0000-0000"
                  className="mt-4 w-full rounded-lg border border-gray-200 px-4 py-3 text-center text-sm focus:outline-none focus:border-[#1976D2]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const input = phoneInput.replace(/[^\d]/g, "")
                      const stored = (coachInfo?.phone || "").replace(/[^\d]/g, "")
                      if (input === stored) setPhoneVerified(true)
                      else setPhoneError("연락처가 일치하지 않습니다")
                    }
                  }}
                />
                {phoneError && <p className="mt-2 text-center text-xs text-red-500">{phoneError}</p>}
                <button
                  onClick={() => {
                    const input = phoneInput.replace(/[^\d]/g, "")
                    const stored = (coachInfo?.phone || "").replace(/[^\d]/g, "")
                    if (input === stored) setPhoneVerified(true)
                    else setPhoneError("연락처가 일치하지 않습니다")
                  }}
                  className="mt-3 w-full cursor-pointer rounded-lg bg-[#1976D2] py-2.5 text-sm font-semibold text-white hover:bg-[#1565C0] transition-colors"
                >
                  확인
                </button>
              </div>
            ) : coachInfo && token ? (
              <CoachProfileEdit
                token={token}
                profile={{
                  phone: coachInfo.phone,
                  email: (coachInfo as any).email,
                  affiliation: (coachInfo as any).affiliation,
                  availabilityDetail: coachInfo.availabilityDetail,
                  fields: coachInfo.fields ?? [],
                  curriculums: coachInfo.curriculums ?? [],
                }}
                onSaved={() => {
                  fetch(`/api/coach/me?token=${token}`).then(r => r.json()).then(setCoachInfo)
                }}
              />
            ) : null}
          </div>
          )}
        </div>

        {/* Time panel — visible when a day is selected and month is editable */}
        {selectedDay && isEditable && (
          <TimePanel
            month={currentMonth + 1}
            day={selectedDayNum}
            selectedSlots={currentDaySlots}
            confirmedSlots={currentDayConfirmed}
            onToggleSlot={handleToggleSlot}
            onSelectAll={handleSelectAll}
            onClear={handleClear}
          />
        )}
      </div>

      {/* Save — mobile: full-width bottom bar, desktop: inline under calendar */}
      {isEditable ? (
        <>
          <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur-sm md:hidden">
            <button
              onClick={handleSave}
              disabled={saving}
              className={`block w-full cursor-pointer rounded-lg border-none py-3 text-sm font-semibold transition-all disabled:opacity-50 ${
                saved
                  ? "bg-[#2E7D32] text-white"
                  : "bg-[#1976D2] text-white hover:bg-[#1565C0]"
              }`}
            >
              {saving ? "저장 중..." : saved ? "✓ 저장됨" : "저장하기"}
            </button>
          </div>
          <div className="hidden md:block fixed bottom-5 right-5 z-10">
            <SaveButton
              onSave={handleSave}
              saving={saving}
              saved={saved}
              savedDayCount={savedDayCount}
              savedTotalHours={savedTotalHours}
            />
          </div>
        </>
      ) : (
        <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-gray-200 bg-white/95 px-4 py-3 text-center text-base text-gray-400 backdrop-blur-sm md:hidden">
          이전 달은 조회만 가능합니다
        </div>
      )}

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-16 left-1/2 z-20 -translate-x-1/2 rounded-xl bg-gray-800 px-6 py-3 text-base text-white shadow-lg max-md:bottom-20">
          {toastMsg}
        </div>
      )}

      {/* Bottom spacer for mobile bar */}
      <div className="h-16 md:hidden" />
    </div>
  )
}
