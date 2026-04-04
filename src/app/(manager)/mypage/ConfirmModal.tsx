"use client"

import React, { useMemo, useState } from "react"
import { isHoliday } from "@/lib/holidays"
import {
  Scouting,
  DAY_NAMES,
  parseTimeRange,
  formatScheduleLine,
} from "./utils"

interface ConfirmModalProps {
  scouting: Scouting
  scoutings: Scouting[]
  updating: boolean
  onConfirm: (extra: Record<string, string>) => void
  onClose: () => void
}

interface DateChip {
  date: string
  dayOfMonth: number
  isOff: boolean
}

function getInitialTimes(
  scouting: Scouting,
  prevConfirmed: Scouting | null,
  start: string,
  end: string
): { dateTimes: Record<string, string>; allTimeInput: string } {
  if (scouting.scheduleText) {
    const lines = scouting.scheduleText.split("\n")
    const times: Record<string, string> = {}
    for (const line of lines) {
      const m = line.match(/^(\d{4}-\d{2}-\d{2})\(.+?\)\s+(\d{2}:\d{2})\s*~\s*(\d{2}:\d{2})/)
      if (m) times[m[1]] = `${m[2]}~${m[3]}`
    }
    const first = Object.values(times)[0] || "09:00~18:00"
    return { dateTimes: times, allTimeInput: first }
  }

  if (prevConfirmed?.scheduleText) {
    const lines = prevConfirmed.scheduleText.split("\n")
    const m = lines[0]?.match(/^(\d{4}-\d{2}-\d{2})\(.+?\)\s+(\d{2}:\d{2})\s*~\s*(\d{2}:\d{2})/)
    const t = m ? `${m[2]}~${m[3]}` : "09:00~18:00"
    const times: Record<string, string> = {}

    if (start && end) {
      const cursor = new Date(start + "T12:00:00Z")
      const endD = new Date(end + "T12:00:00Z")
      while (cursor <= endD) {
        const dateStr = cursor.toISOString().slice(0, 10)
        const dow = cursor.getUTCDay()
        if (dow !== 0 && dow !== 6 && !isHoliday(dateStr)) times[dateStr] = t
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      }
    }

    return { dateTimes: times, allTimeInput: t }
  }

  return { dateTimes: {}, allTimeInput: "09:00~18:00" }
}

function buildDateChips(startDate: string, endDate: string): DateChip[] {
  if (!startDate || !endDate) return []

  const dates: DateChip[] = []
  const cursor = new Date(startDate + "T12:00:00Z")
  const end = new Date(endDate + "T12:00:00Z")

  while (cursor <= end) {
    const dateStr = cursor.toISOString().slice(0, 10)
    const dow = cursor.getUTCDay()
    dates.push({ date: dateStr, dayOfMonth: cursor.getUTCDate(), isOff: dow === 0 || dow === 6 || isHoliday(dateStr) })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return dates
}

function getDefaultSelectedDates(dateChips: DateChip[], dateTimes: Record<string, string>, current?: Set<string>): Set<string> {
  const chipDates = new Set(dateChips.map((d) => d.date))
  const preserved = current ? [...current].filter((date) => chipDates.has(date)) : []
  if (preserved.length > 0) return new Set(preserved)

  const prefilled = Object.keys(dateTimes).filter((date) => chipDates.has(date))
  if (prefilled.length > 0) return new Set(prefilled)

  return new Set(dateChips.filter((d) => !d.isOff).map((d) => d.date))
}

export default function ConfirmModal({ scouting, scoutings, updating, onConfirm, onClose }: ConfirmModalProps) {
  const s = scouting
  const courseStart = s.course?.startDate ? s.course.startDate.slice(0, 10) : (s.hireStart || "")
  const courseEnd = s.course?.endDate ? s.course.endDate.slice(0, 10) : (s.hireEnd || "")

  // Find previous confirmed scouting on same course for time auto-fill
  const prevConfirmed = useMemo(() => {
    if (!s.courseId) return null
    return scoutings.find(x => x.id !== s.id && x.status === "confirmed" && x.courseId === s.courseId && x.scheduleText)
  }, [scoutings, s.id, s.courseId])
  const initialTimes = getInitialTimes(s, prevConfirmed || null, courseStart, courseEnd)
  const initialDateChips = buildDateChips(courseStart, courseEnd)

  const [startDate, setStartDate] = useState(courseStart)
  const [endDate, setEndDate] = useState(courseEnd)
  const [dateTimes, setDateTimes] = useState<Record<string, string>>(() => initialTimes.dateTimes)
  const [allTimeInput, setAllTimeInput] = useState(() => initialTimes.allTimeInput)
  const [showPreview, setShowPreview] = useState(false)
  const [selectedDates, setSelectedDates] = useState<Set<string>>(() =>
    getDefaultSelectedDates(initialDateChips, initialTimes.dateTimes)
  )

  const dateChips = useMemo(() => {
    return buildDateChips(startDate, endDate)
  }, [startDate, endDate])

  const weekGroups = useMemo(() => {
    const groups: typeof dateChips[] = []
    let current: typeof dateChips = []
    for (let i = 0; i < dateChips.length; i++) {
      current.push(dateChips[i])
      if (i < dateChips.length - 1) {
        const curr = new Date(dateChips[i].date + "T12:00:00Z")
        const next = new Date(dateChips[i + 1].date + "T12:00:00Z")
        const diff = (next.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24)
        if (diff > 1) {
          groups.push(current)
          current = []
        }
      }
    }
    if (current.length > 0) groups.push(current)
    return groups
  }, [dateChips])
  let defaultTime = ""
  for (const d of dateChips) {
    if (selectedDates.has(d.date) && dateTimes[d.date]?.trim()) {
      defaultTime = dateTimes[d.date].trim()
      break
    }
  }

  const outputLines = useMemo(() => {
    if (!defaultTime || selectedDates.size === 0) return []
    return dateChips
      .filter(d => selectedDates.has(d.date))
      .map(d => {
        const t = parseTimeRange(dateTimes[d.date]?.trim() || defaultTime)
        if (!t) return null
        return formatScheduleLine(d.date, t.start, t.end)
      })
      .filter((l): l is string => l !== null)
  }, [dateChips, selectedDates, dateTimes, defaultTime])

  // Validation: time parsing must succeed for all selected dates
  const timeValid = useMemo(() => {
    if (selectedDates.size === 0) return false
    if (!defaultTime) return false
    const parsed = parseTimeRange(allTimeInput.trim() || defaultTime)
    if (!parsed) return false
    return outputLines.length > 0
  }, [selectedDates, defaultTime, allTimeInput, outputLines])

  function toggleDate(dateStr: string) {
    setSelectedDates(prev => {
      const next = new Set(prev)
      if (next.has(dateStr)) next.delete(dateStr)
      else next.add(dateStr)
      return next
    })
  }

  function applyTimeToAll(v: string) {
    setAllTimeInput(v)
    setDateTimes(prev => {
      const next = { ...prev }
      for (const d of dateChips) { if (selectedDates.has(d.date)) next[d.date] = v }
      return next
    })
  }

  function handleStartDateChange(nextStartDate: string) {
    setStartDate(nextStartDate)
    const nextDateChips = buildDateChips(nextStartDate, endDate)
    setSelectedDates((current) => getDefaultSelectedDates(nextDateChips, dateTimes, current))
  }

  function handleEndDateChange(nextEndDate: string) {
    setEndDate(nextEndDate)
    const nextDateChips = buildDateChips(startDate, nextEndDate)
    setSelectedDates((current) => getDefaultSelectedDates(nextDateChips, dateTimes, current))
  }

  function handleConfirm() {
    const siblings = scoutings.filter(x =>
      x.id !== s.id && x.status === "accepted" &&
      x.date.slice(0, 10) === s.date.slice(0, 10) && x.courseId === s.courseId
    )
    const msg = siblings.length > 0
      ? `${s.coach.name} 코치를 확정하시겠습니까?\n같은 날짜의 다른 수락 코치 ${siblings.length}명은 자동 취소됩니다.`
      : `${s.coach.name} 코치를 확정하시겠습니까?`
    if (!confirm(msg)) return

    const extra: Record<string, string> = {}
    if (s.course?.name || s.courseName) extra.courseName = s.course?.name || s.courseName || ""
    if (startDate) extra.hireStart = startDate
    if (endDate) extra.hireEnd = endDate
    if (outputLines.length > 0) extra.scheduleText = outputLines.join("\n")
    onConfirm(extra)
  }

  const timeInputInvalid = allTimeInput.trim() !== "" && !parseTimeRange(allTimeInput.trim())

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2.5">
      {/* Course name */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-gray-400 shrink-0">과정명:</span>
        {s.courseId ? (
          <span className="text-xs font-medium text-[#333]">{s.course?.name || s.courseName}</span>
        ) : (
          <input
            type="text"
            defaultValue={s.courseName || ""}
            placeholder="선택"
            onKeyDown={(e) => { if (e.key === "Escape") onClose() }}
            className="flex-1 min-w-[140px] rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-[#333] placeholder:text-gray-300 focus:border-[#1976D2] focus:outline-none"
          />
        )}
      </div>

      {/* Period */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-gray-400 shrink-0">기간:</span>
        <input type="date" value={startDate} onChange={(e) => handleStartDateChange(e.target.value)}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-[#333] focus:border-[#1976D2] focus:outline-none" />
        <span className="text-xs text-gray-400">~</span>
        <input type="date" value={endDate} onChange={(e) => handleEndDateChange(e.target.value)}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-[#333] focus:border-[#1976D2] focus:outline-none" />
      </div>

      {/* Date chips and time */}
      {weekGroups.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-gray-400 shrink-0">시간:</span>
            <input
              type="text"
              value={allTimeInput}
              onChange={(e) => applyTimeToAll(e.target.value)}
              placeholder="9~18"
              className={`w-24 rounded-lg border px-2 py-1 text-[11px] text-[#333] placeholder:text-gray-300 focus:outline-none ${
                timeInputInvalid ? "border-red-400 focus:border-red-500" : "border-gray-200 focus:border-[#1976D2]"
              }`}
            />
            {[["09:00~18:00", "09:00~18:00"], ["08:30~17:30", "08:30~17:30"]].map(([v, label]) => (
              <button key={v} onClick={() => applyTimeToAll(v)}
                className={`cursor-pointer rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
                  allTimeInput === v ? "bg-[#1976D2] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}>
                {label}
              </button>
            ))}
          </div>
          {weekGroups.map((wg, gi) => (
            <div key={gi} className="flex items-center gap-1.5 flex-wrap">
              {wg.map((d) => {
                const sel = selectedDates.has(d.date)
                const dn = DAY_NAMES[new Date(d.date + "T12:00:00Z").getUTCDay()]
                const cellTime = dateTimes[d.date] || ""
                const cellInvalid = sel && cellTime.trim() !== "" && !parseTimeRange(cellTime.trim())
                return (
                  <div key={d.date} className="flex items-center gap-0.5">
                    <button onClick={() => toggleDate(d.date)}
                      className={`cursor-pointer rounded-l-lg px-1.5 py-1 text-[11px] font-semibold transition-colors ${
                        sel ? "bg-[#1976D2] text-white" : d.isOff ? "bg-red-50 text-red-300" : "bg-gray-100 text-gray-300"
                      }`}>
                      {d.dayOfMonth}({dn})
                    </button>
                    {sel && (
                      <input type="text" value={cellTime}
                        onChange={(e) => setDateTimes(prev => ({ ...prev, [d.date]: e.target.value }))}
                        placeholder={defaultTime || "09:00~18:00"}
                        className={`w-24 rounded-r-lg border border-l-0 px-1.5 py-1 text-[11px] text-[#333] placeholder:text-gray-300 focus:outline-none ${
                          cellInvalid ? "border-red-400 focus:border-red-500" : "border-gray-200 focus:border-[#1976D2]"
                        }`}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </>
      )}

      {/* Preview (collapsed by default) */}
      {outputLines.length > 0 && (
        <div>
          <button
            onClick={() => setShowPreview(p => !p)}
            className="cursor-pointer text-[11px] text-gray-400 hover:text-gray-600"
          >
            {showPreview ? "미리보기 닫기 ▲" : "미리보기 ▼"}
          </button>
          {showPreview && (
            <div className="mt-1 rounded-lg bg-white border border-gray-100 px-3 py-2 space-y-0.5">
              {outputLines.map((line) => (
                <div key={line} className="text-[11px] text-gray-500 font-mono">{line}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleConfirm}
          disabled={updating || !timeValid}
          className="cursor-pointer rounded-full px-3 py-1.5 text-[11px] font-medium bg-[#1976D2] text-white hover:bg-[#1565C0] transition-colors disabled:opacity-50"
        >
          {updating ? "..." : "확정"}
        </button>
        <button onClick={onClose}
          className="cursor-pointer rounded-full px-2 py-1.5 text-[11px] text-gray-400 hover:text-gray-600">
          닫기
        </button>
      </div>
    </div>
  )
}
