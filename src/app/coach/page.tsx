"use client"

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import CoachHeader from "@/components/coach/CoachHeader"
import ScheduleCalendar from "@/components/coach/ScheduleCalendar"
import TimePanel, { ALL_SLOTS } from "@/components/coach/TimePanel"
import ScheduleSummary, { cleanCourseName } from "@/components/coach/ScheduleSummary"
import SaveButton from "@/components/coach/SaveButton"
import CoachProfileEdit from "@/components/coach/CoachProfileEdit"
import ScoutingAlerts from "@/components/coach/ScoutingAlerts"

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

interface EngagementScheduleEntry {
  date: string
  startTime: string
  endTime: string
  courseName: string
  status: string
}

interface ScoutingEntry {
  date: string
  managerName: string
  courseName: string | null
  hireStart: string | null
  hireEnd: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────

const UNAVAILABLE_SENTINEL = "00:00" // startTime === endTime === "00:00" → 불가

const BULK_RANGES = [
  { label: "오전", start: "08:00", end: "13:00" },
  { label: "오후", start: "13:00", end: "18:00" },
  { label: "저녁", start: "18:00", end: "22:00" },
  { label: "종일", start: "08:00", end: "22:00" },
] as const

/** Convert API schedule ranges → { slotMap, unavailableDates } */
function schedulesToSlotMap(schedules: ScheduleSlot[]): { slotMap: Map<string, Set<string>>; unavailableDates: Set<string> } {
  const map = new Map<string, Set<string>>()
  const unavailable = new Set<string>()
  for (const s of schedules) {
    // 불가 센티널
    if (s.startTime === UNAVAILABLE_SENTINEL && s.endTime === UNAVAILABLE_SENTINEL) {
      unavailable.add(s.date)
      continue
    }
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
  return { slotMap: map, unavailableDates: unavailable }
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
  const [unavailableDates, setUnavailableDates] = useState<Set<string>>(new Set())
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [engSchedules, setEngSchedules] = useState<EngagementScheduleEntry[]>([])
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [scoutingEntries, setScoutingEntries] = useState<ScoutingEntry[]>([])


  // Editing state — working copy that only modifies the "available" slots
  const [editingSlots, setEditingSlots] = useState<Map<string, Set<string>>>(new Map())

  // UI state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [showProfile, setShowProfile] = useState(false)
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [phoneInput, setPhoneInput] = useState("")
  const [phoneError, setPhoneError] = useState("")
  const [showFormPrompt, setShowFormPrompt] = useState(false)

  // Only current month and next month are editable
  const isEditable = useMemo(() => {
    const now = new Date()
    const currentYM = now.getFullYear() * 12 + now.getMonth()
    const viewingYM = currentYear * 12 + currentMonth
    const decemberYM = now.getFullYear() * 12 + 11
    return viewingYM >= currentYM && viewingYM <= decemberYM
  }, [currentYear, currentMonth])

  // Derived: all dates that have schedule entries (for cross-referencing with engagements)
  const allScheduleDates = useMemo(() => {
    const set = new Set<string>()
    for (const [key, slots] of schedules) {
      if (slots.size > 0) set.add(key)
    }
    return set
  }, [schedules])

  // Derived: confirmed data from engagementSchedules (실제 확정 일정)
  const confirmedDates = useMemo(() => {
    const set = new Set<string>()
    for (const es of engSchedules) {
      if (es.status === "scheduled" || es.status === "in_progress" || es.status === "completed") {
        set.add(es.date)
      }
    }
    return set
  }, [engSchedules])

  const confirmedSlotsMap = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const es of engSchedules) {
      if (es.status !== "scheduled" && es.status !== "in_progress" && es.status !== "completed") continue
      if (!map.has(es.date)) map.set(es.date, new Set())
      const set = map.get(es.date)!
      const [sh, sm] = es.startTime.split(":").map(Number)
      const [eh, em] = es.endTime.split(":").map(Number)
      let h = sh, m = sm
      while (h < eh || (h === eh && m < em)) {
        const slotKey = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
        if (ALL_SLOTS.includes(slotKey)) set.add(slotKey)
        m += 30
        if (m >= 60) { h += 1; m = 0 }
      }
    }
    return map
  }, [engSchedules])

  // Derived: available dates (from editing slots)
  const availableDates = useMemo(() => {
    const set = new Set<string>()
    for (const [key, slots] of editingSlots) {
      if (slots.size > 0) set.add(key)
    }
    return set
  }, [editingSlots])

  // Derived: scouting dates map (for calendar cell styling)
  const scoutingDates = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of scoutingEntries) {
      map.set(s.date, s.managerName)
    }
    return map
  }, [scoutingEntries])

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
        engagementSchedules: EngagementScheduleEntry[]
        lastSavedAt: string | null
        scoutings?: ScoutingEntry[]
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
        if (!coach.fields || coach.fields.length === 0) {
          setShowFormPrompt(true)
        }

        const { slotMap, unavailableDates: unavail } = schedulesToSlotMap(scheduleData.schedules)
        setSchedules(slotMap)
        setUnavailableDates(unavail)
        setEditingSlots(deepCopySlotMap(slotMap)) // deep copy
        setEngagements(scheduleData.engagements)
        setEngSchedules(scheduleData.engagementSchedules || [])
        setLastSavedAt(scheduleData.lastSavedAt)
        setScoutingEntries(scheduleData.scoutings || [])
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

      // 이동 범위 제한: 올해 12월까지
      const now = new Date()
      const currentYM = now.getFullYear() * 12 + now.getMonth()
      const decemberYM = now.getFullYear() * 12 + 11
      const targetYM = newYear * 12 + newMonth
      if (targetYM < currentYM || targetYM > decemberYM) return

      // 저장하지 않은 변경사항 확인
      const hasUnsaved = (() => {
        for (const [key, slots] of editingSlots) {
          const saved = schedules.get(key)
          if (!saved && slots.size > 0) return true
          if (saved && (slots.size !== saved.size || [...slots].some(s => !saved.has(s)))) return true
        }
        for (const [key, saved] of schedules) {
          if (saved.size > 0 && !editingSlots.has(key)) return true
        }
        return false
      })()
      if (hasUnsaved && !window.confirm("저장하지 않은 변경사항이 있습니다. 이동하시겠습니까?")) return

      setSelectedDay(null)
      setCurrentYear(newYear)
      setCurrentMonth(newMonth)
      setSaved(false)

      // Fetch new month's schedule
      try {
        const ym = yearMonthStr(newYear, newMonth)
        const data = await fetchSchedule(ym)
        const { slotMap, unavailableDates: unavail } = schedulesToSlotMap(data.schedules)
        setSchedules(slotMap)
        setUnavailableDates(unavail)
        setEditingSlots(deepCopySlotMap(slotMap))
        setEngagements(data.engagements)
        setEngSchedules(data.engagementSchedules || [])
        setLastSavedAt(data.lastSavedAt)
        setScoutingEntries(data.scoutings || [])
      } catch {
        showToast("일정을 불러오지 못했습니다")
      }
    },
    [currentYear, currentMonth, fetchSchedule, editingSlots, schedules]
  )

  // ─── Day selection ──────────────────────────────────────────────

  const handleSelectDay = useCallback(
    (dateKey: string, day: number) => {
      if (selectedDay === dateKey) {
        // 불가 날짜를 다시 클릭하면 불가 해제
        if (unavailableDates.has(dateKey)) {
          setUnavailableDates((prev) => {
            const next = new Set(prev)
            next.delete(dateKey)
            return next
          })
        } else {
          // Deselect
          setSelectedDay(null)
        }
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
    [selectedDay, unavailableDates]
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
      // 가용 시간 선택하면 불가 해제
      setUnavailableDates((prev) => {
        if (prev.has(selectedDay)) { const next = new Set(prev); next.delete(selectedDay); return next }
        return prev
      })
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

  const handleToggleUnavailable = useCallback(() => {
    if (!selectedDay) return
    setUnavailableDates((prev) => {
      const next = new Set(prev)
      if (next.has(selectedDay)) {
        next.delete(selectedDay)
      } else {
        next.add(selectedDay)
        // 불가 전환 시 해당일 가용 슬롯 초기화
        setEditingSlots((p) => {
          const n = new Map(p)
          n.set(selectedDay, new Set())
          return n
        })
      }
      return next
    })
  }, [selectedDay])

  // ─── Fill all future dates as 종일 ──────────────────────────────

  const handleBulkToggle = useCallback((start: string, end: string) => {
    const today = new Date()
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const lastDate = new Date(currentYear, currentMonth + 1, 0).getDate()
    const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`
    const rangeSlots = ALL_SLOTS.filter(s => s >= start && s < end)

    // Check if all future dates already have this range
    let allFilled = true
    for (let d = 1; d <= lastDate; d++) {
      const date = new Date(currentYear, currentMonth, d)
      if (date < todayStart) continue
      const dateKey = `${monthPrefix}-${String(d).padStart(2, "0")}`
      const confirmed = confirmedSlotsMap.get(dateKey) ?? new Set()
      const daySlots = editingSlots.get(dateKey) ?? new Set()
      for (const s of rangeSlots) {
        if (!confirmed.has(s) && !daySlots.has(s)) { allFilled = false; break }
      }
      if (!allFilled) break
    }

    setEditingSlots((prev) => {
      const next = new Map(prev)
      for (let d = 1; d <= lastDate; d++) {
        const date = new Date(currentYear, currentMonth, d)
        if (date < todayStart) continue
        const dateKey = `${monthPrefix}-${String(d).padStart(2, "0")}`
        const confirmed = confirmedSlotsMap.get(dateKey) ?? new Set()
        const daySlots = new Set(next.get(dateKey) ?? [])
        for (const s of rangeSlots) {
          if (!confirmed.has(s)) {
            if (allFilled) daySlots.delete(s)
            else daySlots.add(s)
          }
        }
        next.set(dateKey, daySlots)
      }
      return next
    })

    if (!allFilled) {
      // 불가 날짜도 해제
      setUnavailableDates((prev) => {
        const next = new Set(prev)
        for (let d = 1; d <= lastDate; d++) {
          const date = new Date(currentYear, currentMonth, d)
          if (date < todayStart) continue
          const dateKey = `${monthPrefix}-${String(d).padStart(2, "0")}`
          next.delete(dateKey)
        }
        return next
      })
    }
  }, [currentYear, currentMonth, confirmedSlotsMap, editingSlots])

  const bulkStatus = useMemo(() => {
    const today = new Date()
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const lastDate = new Date(currentYear, currentMonth + 1, 0).getDate()
    const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`

    return BULK_RANGES.map(({ start, end }) => {
      const rangeSlots = ALL_SLOTS.filter(s => s >= start && s < end)
      let allFilled = true
      let hasFutureDays = false
      for (let d = 1; d <= lastDate; d++) {
        const date = new Date(currentYear, currentMonth, d)
        if (date < todayStart) continue
        hasFutureDays = true
        const dateKey = `${monthPrefix}-${String(d).padStart(2, "0")}`
        const confirmed = confirmedSlotsMap.get(dateKey) ?? new Set()
        const daySlots = editingSlots.get(dateKey) ?? new Set()
        for (const s of rangeSlots) {
          if (!confirmed.has(s) && !daySlots.has(s)) { allFilled = false; break }
        }
        if (!allFilled) break
      }
      return hasFutureDays && allFilled
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentYear, currentMonth, confirmedSlotsMap, editingSlots])

  // ─── Save ───────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    const ym = yearMonthStr(currentYear, currentMonth)
    const apiSlots = slotMapToApiSlots(editingSlots)

    // Filter to only include slots for the current month
    const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`
    const monthSlots = apiSlots.filter((s) => s.date.startsWith(monthPrefix))

    // 불가 날짜 센티널 추가
    for (const dateKey of unavailableDates) {
      if (dateKey.startsWith(monthPrefix)) {
        monthSlots.push({ date: dateKey, startTime: "00:00", endTime: "00:00" })
      }
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/coach/schedule/${ym}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ slots: monthSlots }),
      })
      if (!res.ok) throw new Error("Save failed")

      setSchedules(deepCopySlotMap(editingSlots))
      setLastSavedAt(new Date().toISOString())
      setSaved(true)
      showToast("저장되었습니다!")
      setTimeout(() => setSaved(false), 2000)
    } catch {
      showToast("저장에 실패했습니다. 다시 시도해주세요.")
    } finally {
      setSaving(false)
    }
  }, [currentYear, currentMonth, editingSlots, unavailableDates, headers])

  // ─── Toast ──────────────────────────────────────────────────────

  function showToast(msg: string) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 2500)
  }

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
  const currentDayCourseNames = selectedDay
    ? [...new Set(engSchedules.filter(es => es.date === selectedDay && (es.status === "scheduled" || es.status === "in_progress" || es.status === "completed")).map(es => cleanCourseName(es.courseName)))]
    : []

  const selectedDayEngagements = selectedDay
    ? (() => {
        const entries = engSchedules.filter(
          es => es.date === selectedDay &&
          (es.status === "scheduled" || es.status === "in_progress" || es.status === "completed")
        )
        const grouped = new Map<string, Set<string>>()
        for (const es of entries) {
          const name = cleanCourseName(es.courseName)
          if (!grouped.has(name)) grouped.set(name, new Set())
          grouped.get(name)!.add(`${es.startTime}~${es.endTime}`)
        }
        return [...grouped.entries()].map(([courseName, times]) => ({ courseName, timeText: [...times].join(", ") }))
      })()
    : []

  const selectedDayScoutings = selectedDay
    ? scoutingEntries.filter(s => s.date === selectedDay)
    : []

  // 비활성 코치 → 안내 화면
  if (coachInfo?.status === "inactive") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f5f5] p-5">
        <div className="w-full max-w-[calc(100vw-2rem)] sm:max-w-[400px] rounded-2xl bg-white p-8 shadow-[0_2px_12px_rgba(0,0,0,0.08)] text-center">
          <h2 className="text-lg font-semibold text-[#333]">다시 코치로 활동하고 싶으신가요?</h2>
          <p className="mt-3 text-sm text-gray-500 leading-relaxed">
            코치님의 복귀를 언제나 환영합니다!<br />
            다시 활동을 시작할 준비가 되셨다면,<br />
            아래 링크에 폼을 남겨주세요.
          </p>
          <a
            href="https://forms.gle/b1BSX7yKYY1nyYCb6"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-block rounded-lg bg-[#1976D2] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#1565C0] transition-colors"
          >
            복귀 신청하기
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen justify-center bg-[#f5f5f5] p-5 pb-10 max-md:p-2.5 max-md:pb-20">
      <div className="flex w-full max-w-[calc(100vw-2rem)] sm:max-w-[480px] flex-col items-center gap-4">
        {/* Main container */}
        <div className="w-full overflow-hidden rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
          <CoachHeader
            coachName={coachInfo?.name ?? ""}
            token={token ?? undefined}
            onProfile={() => setShowProfile(true)}
          />

          <div className="px-4 sm:px-7 pt-5 pb-7">
            <ScheduleCalendar
              year={currentYear}
              month={currentMonth}
              selectedDay={selectedDay}
              availableDates={availableDates}
              confirmedDates={confirmedDates}
              unavailableDates={unavailableDates}
              onSelectDay={handleSelectDay}
              onConfirmedClick={handleConfirmedClick}
              onToggleSlot={handleToggleSlot}
              onBulkToggle={handleBulkToggle}
              bulkStatus={bulkStatus}
              dayEngagements={selectedDayEngagements}
              dayScoutings={selectedDayScoutings}
              scoutingDates={scoutingDates}
              selectedSlots={selectedDay ? (editingSlots.get(selectedDay) ?? new Set()) : new Set()}
              confirmedSlots={currentDayConfirmed}
              onPrevMonth={() => changeMonth(-1)}
              onNextMonth={() => changeMonth(1)}
              canGoPrev={currentYear * 12 + currentMonth > new Date().getFullYear() * 12 + new Date().getMonth()}
              canGoNext={currentYear * 12 + currentMonth < new Date().getFullYear() * 12 + 11}
            />

            {/* Day count — removed, time summary shown inline in calendar */}
            {false && savedDayCount > 0 && (
              <div className="mt-4 text-center text-sm text-[#666]">
                <span className="font-semibold text-[#2E7D32]">{savedDayCount}일</span> 선택됨
              </div>
            )}

            <ScheduleSummary engagements={engagements} lastSavedAt={lastSavedAt} />
          </div>
        </div>

        {/* 받은 요청 — 나의 스케줄 박스 아래 */}
        {token && (
          <div id="scouting-alerts" className="w-full scroll-mt-4">
            <ScoutingAlerts token={token} onAction={async () => {
              const ym = yearMonthStr(currentYear, currentMonth)
              const data = await fetchSchedule(ym)
              setScoutingEntries(data.scoutings || [])
            }} />
          </div>
        )}

        {/* 활동 중지 — 나의 스케줄 박스 바로 아래 */}
        {coachInfo && coachInfo.status !== "inactive" && (
          <DeactivateSection token={token!} phone={coachInfo.phone} onDeactivated={() => {
            window.alert("활동 중지 신청이 완료되었습니다.\n그동안 감사했습니다.")
            setCoachInfo(prev => prev ? { ...prev, status: "inactive" } : prev)
          }} />
        )}

      {/* Google Form prompt — shown when profile fields are empty */}
      {showFormPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-[calc(100vw-2rem)] sm:max-w-[400px] rounded-2xl bg-white p-6 shadow-xl text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#E3F2FD]">
              <svg className="h-6 w-6 text-[#1976D2]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            </div>
            <h3 className="text-base font-semibold text-[#333]">프로필을 입력해주세요</h3>
            <p className="mt-2 text-sm text-gray-500 leading-relaxed">
              프로필을 입력하면 과정 매칭 시 우선 배정됩니다.<br />
              아래 구글폼을 작성하여 제출해주세요.
            </p>
            <a
              href="https://docs.google.com/forms/d/e/1FAIpQLSc6Mt8e1n0mOLEeiDiVVbNZvUFcRWJzHcyzH7a8LE5vib_4fA/viewform"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-block w-full rounded-lg bg-[#1976D2] py-2.5 text-sm font-semibold text-white hover:bg-[#1565C0] transition-colors"
            >
              구글폼 작성하기
            </a>
            <button
              onClick={() => setShowFormPrompt(false)}
              className="mt-2 w-full cursor-pointer rounded-lg bg-transparent py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              나중에 하기
            </button>
          </div>
        </div>
      )}

      {/* Profile modal */}
      {showProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-[calc(100vw-2rem)] sm:max-w-[480px] max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-[#333]">프로필 수정</h3>
              <button onClick={() => setShowProfile(false)} className="cursor-pointer text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5">
              {!phoneVerified && coachInfo?.phone ? (
                <div className="py-4">
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
                  onClose={() => setShowProfile(false)}
                  onDeactivated={() => {
                    setShowProfile(false)
                    setCoachInfo(prev => prev ? { ...prev, status: "inactive" } : prev)
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>
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

// ─── 활동 중지 섹션 ──────────────────────────────────────────────

function DeactivateSection({ token, phone, onDeactivated }: {
  token: string
  phone: string | null
  onDeactivated: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const sectionRef = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState<"phone" | "form">("phone")
  const [phoneInput, setPhoneInput] = useState("")
  const [phoneError, setPhoneError] = useState("")
  const [reason, setReason] = useState("")
  const [returnDate, setReturnDate] = useState("")
  const [submitting, setSubmitting] = useState(false)

  function verifyPhone() {
    const input = phoneInput.replace(/[^\d]/g, "")
    const stored = (phone || "").replace(/[^\d]/g, "")
    if (input === stored) {
      setStep("form")
      setPhoneError("")
      setTimeout(() => sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100)
    } else {
      setPhoneError("연락처가 일치하지 않습니다")
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const note = reason.trim() || null
      const res = await fetch(`/api/coach/me?token=${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "inactive",
          statusNote: note,
          returnDate: returnDate ? `${returnDate}-01` : null,
        }),
      })
      if (res.ok) onDeactivated()
    } finally {
      setSubmitting(false)
    }
  }

  if (!expanded) {
    return (
      <button
        onClick={() => {
          setExpanded(true)
          setTimeout(() => sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100)
        }}
        className="w-full -mt-2 cursor-pointer text-center text-xs text-gray-400 hover:text-gray-500 transition-colors py-1"
      >
        활동을 쉬고 싶으신가요?
      </button>
    )
  }

  return (
    <div ref={sectionRef} className="w-full sm:w-[480px] -mt-2">
      <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] overflow-hidden">
        <div className="px-5 pt-4 pb-1">
          <h3 className="text-sm font-semibold text-[#333]">활동 중지 신청</h3>
        </div>

        <div className="px-5 pb-5 pt-3">
          {step === "phone" ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">본인 확인을 위해 연락처를 입력해주세요</label>
                <input
                  type="text"
                  value={phoneInput}
                  onChange={(e) => { setPhoneInput(e.target.value); setPhoneError("") }}
                  placeholder="010-0000-0000"
                  className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1976D2]"
                  onKeyDown={(e) => { if (e.key === "Enter") verifyPhone() }}
                />
                {phoneError && <p className="mt-1 text-xs text-red-500">{phoneError}</p>}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setExpanded(false)}
                  className="flex-1 cursor-pointer rounded-lg border border-gray-200 py-2.5 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={verifyPhone}
                  className="flex-1 cursor-pointer rounded-lg bg-[#1976D2] py-2.5 text-sm font-semibold text-white hover:bg-[#1565C0] transition-colors"
                >
                  확인
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 leading-relaxed">
                복귀 희망 시기를 적어주시면 원하실 때 다시 연락드리겠습니다.
              </p>
              <div>
                <label className="text-xs text-gray-500">중지 사유 <span className="text-gray-400">(선택)</span></label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="예: 개인 사정으로 당분간 휴식"
                  rows={2}
                  className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1976D2]"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">복귀 희망 시기 <span className="text-gray-400">(선택)</span></label>
                <input
                  type="month"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 7)}
                  className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1976D2]"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setExpanded(false); setStep("phone"); setReason(""); setReturnDate("") }}
                  className="flex-1 cursor-pointer rounded-lg border border-gray-200 py-2.5 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 cursor-pointer rounded-lg bg-red-500 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {submitting ? "처리 중..." : "활동 중지 신청"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
