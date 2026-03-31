"use client"

import { useState, useEffect } from "react"

interface DashboardCalendarProps {
  year: number
  month: number // 0-based
  selectedStart: string | null // "YYYY-MM-DD"
  selectedEnd: string | null   // "YYYY-MM-DD" or null for single date
  monthData: Record<string, number> // { "2026-04-01": 3, ... }
  onSelectDate: (dateStr: string) => void
  onPrevMonth: () => void
  onNextMonth: () => void
  canGoPrev?: boolean
  canGoNext?: boolean
  onToday: () => void
  onRefresh: () => void
  syncing?: boolean
  timeFilter: string
  onTimeFilterChange: (filter: string) => void
  customStart: string
  customEnd: string
  onCustomTimeApply: (start: string, end: string) => void
}

const TIME_PRESETS = [
  { key: "all", label: "전체" },
  { key: "09-18", label: "주간" },
  { key: "19-22", label: "야간" },
]

const TIME_OPTIONS = [
  "07:00", "07:30", "08:00", "08:30", "09:00", "09:30",
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30", "18:00", "18:30",
  "19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00",
]

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

export default function DashboardCalendar({
  year,
  month,
  selectedStart,
  selectedEnd,
  monthData,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  canGoPrev = true,
  canGoNext = true,
  onRefresh,
  syncing = false,
  timeFilter,
  onTimeFilterChange,
  customStart,
  customEnd,
  onCustomTimeApply,
}: DashboardCalendarProps) {
  const firstDay = new Date(year, month, 1)
  // Sunday = 0
  const firstDayOfWeek = firstDay.getDay()
  const lastDate = new Date(year, month + 1, 0).getDate()

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`

  function dateKey(d: number): string {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
  }

  const yearMonthLabel = `${year}년 ${month + 1}월`

  return (
    <div className="min-w-0 rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100 sm:p-5">
      {/* Time filter — presets + selects in one row */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {TIME_PRESETS.map((f) => {
          const presetRanges: Record<string, [string, string]> = {
            "09-18": ["09:00", "18:00"],
            "19-22": ["19:00", "22:00"],
          }
          const isActive = timeFilter === f.key || (timeFilter === "custom" && presetRanges[f.key]?.[0] === customStart && presetRanges[f.key]?.[1] === customEnd)
          return (
            <button
              key={f.key}
              onClick={() => {
                if (f.key === "all") {
                  onTimeFilterChange("all")
                } else {
                  const [s, e] = presetRanges[f.key] || ["09:00", "18:00"]
                  onCustomTimeApply(s, e)
                }
              }}
              className={`cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                isActive
                  ? "bg-[#1976D2] text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {f.label}
            </button>
          )
        })}
        <div className="relative">
          <select
            value={customStart}
            onChange={(e) => onCustomTimeApply(e.target.value, customEnd)}
            className={`w-[62px] cursor-pointer rounded-full pl-2.5 pr-4 py-1 text-[11px] font-medium focus:outline-none appearance-none transition-colors ${
              timeFilter === "custom"
                ? "bg-[#E3F2FD] text-[#1976D2]"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {TIME_OPTIONS.slice(0, -1).map((t) => (
              <option key={t} value={t}>{t.replace(/^0/, '')}</option>
            ))}
          </select>
          <svg className={`pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 ${timeFilter === "custom" ? "text-[#1976D2]" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </div>
        <span className="text-[11px] text-gray-400">~</span>
        <div className="relative">
          <select
            value={customEnd}
            onChange={(e) => onCustomTimeApply(customStart, e.target.value)}
            className={`w-[62px] cursor-pointer rounded-full pl-2.5 pr-4 py-1 text-[11px] font-medium focus:outline-none appearance-none transition-colors ${
              timeFilter === "custom"
                ? "bg-[#E3F2FD] text-[#1976D2]"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {TIME_OPTIONS.slice(1).map((t) => (
              <option key={t} value={t}>{t.replace(/^0/, '')}</option>
            ))}
          </select>
          <svg className={`pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 ${timeFilter === "custom" ? "text-[#1976D2]" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </div>
        <button
          onClick={onRefresh}
          disabled={syncing}
          className={`cursor-pointer rounded-full p-1.5 transition-colors ${
            syncing ? 'text-[#2E7D32]' : 'text-gray-400 hover:text-[#2E7D32] hover:bg-gray-100'
          }`}
          title={syncing ? '동기화 중...' : '새로고침'}
        >
          <svg className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
        </button>
      </div>

      {/* Header row */}
      <div className="relative mb-5 flex items-center justify-center">
        <div className="flex items-center gap-3">
          {canGoPrev ? (
            <button
              onClick={onPrevMonth}
              className="cursor-pointer rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          ) : <div className="w-7" />}
          <h2 className="w-28 text-center text-sm font-semibold tabular-nums text-[#333] sm:w-32 sm:text-sm">
            {yearMonthLabel}
          </h2>
          {canGoNext ? (
            <button
              onClick={onNextMonth}
              className="cursor-pointer rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : <div className="w-7" />}
        </div>
      </div>

      {/* Weekday headers */}
      <div className="mb-1 grid grid-cols-7 text-center">
        {WEEKDAYS.map((w, i) => (
          <span
            key={w}
            className={`py-2 text-xs font-medium ${
              i === 0
                ? "text-red-500"
                : i === 6
                  ? "text-blue-500"
                  : "text-gray-400"
            }`}
          >
            {w}
          </span>
        ))}
      </div>

      {/* Day cells grid — always 42 cells (6 rows) for stable layout */}
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 42 }).map((_, i) => {
          const dayNum = i - firstDayOfWeek + 1
          const isValidDay = dayNum >= 1 && dayNum <= lastDate

          if (!isValidDay) {
            return <div key={`cell-${i}`} className="py-2.5" />
          }

          const key = dateKey(dayNum)
          const isoDow = (new Date(year, month, dayNum).getDay() + 6) % 7
          const count = monthData[key] ?? 0
          const isToday = key === todayStr
          const isPast = key < todayStr
          const isStart = key === selectedStart
          const isEnd = key === selectedEnd
          const isInRange = !!(selectedStart && selectedEnd && key > selectedStart && key < selectedEnd)
          const isSelected = isStart || isEnd

          let cellClasses =
            "flex flex-col items-center justify-center rounded-xl cursor-pointer transition-colors text-sm py-2.5 gap-0.5"

          if (isSelected) {
            cellClasses += " bg-[#1976D2] text-white"
          } else if (isInRange) {
            cellClasses += " bg-[#E3F2FD] text-[#1976D2]"
          } else if (isPast) {
            cellClasses += " opacity-35 hover:opacity-60"
          } else if (isToday) {
            cellClasses += " ring-2 ring-[#1565C0] hover:bg-gray-50"
          } else {
            cellClasses += " hover:bg-gray-50"
          }

          let dayColor = isSelected ? "text-white" : "text-gray-700"
          if (!isSelected) {
            if (isoDow === 5) dayColor = "text-blue-500"
            if (isoDow === 6) dayColor = "text-red-500"
          }

          return (
            <div
              key={key}
              className={cellClasses}
              onClick={() => onSelectDate(key)}
            >
              <span
                className={`text-sm font-medium ${dayColor}`}
              >
                {dayNum}
              </span>
              {count > 0 ? (
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                    isSelected
                      ? "bg-white/30 text-white"
                      : "bg-[#E3F2FD] text-[#1976D2]"
                  }`}
                >
                  {count}
                </span>
              ) : (
                <span className={`text-[11px] ${isSelected ? "text-white/30" : "text-gray-200"}`}>-</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Time Range Dropdown ───

function TimeRangeDropdown({
  customStart,
  customEnd,
  isActive,
  onApply,
}: {
  customStart: string
  customEnd: string
  isActive: boolean
  onApply: (start: string, end: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [start, setStart] = useState(customStart)
  const [end, setEnd] = useState(customEnd)
  const [prevStart, setPrevStart] = useState(customStart)
  const [prevEnd, setPrevEnd] = useState(customEnd)

  if (customStart !== prevStart || customEnd !== prevEnd) {
    setStart(customStart)
    setEnd(customEnd)
    setPrevStart(customStart)
    setPrevEnd(customEnd)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`cursor-pointer rounded-full border px-2 py-1 text-[11px] font-medium transition-colors ${
          isActive
            ? "border-[#1976D2] bg-[#E3F2FD] text-[#1976D2]"
            : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
        }`}
      >
        {isActive ? `${customStart.replace(/^0/, '')}~${customEnd.replace(/^0/, '')}` : "시간 지정"} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
            <div className="flex items-center gap-2">
              <select
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="flex-1 min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs focus:border-[#1976D2] focus:outline-none appearance-none"
              >
                {TIME_OPTIONS.slice(0, -1).map((t) => (
                  <option key={t} value={t}>{t.replace(/^0/, '')}</option>
                ))}
              </select>
              <span className="text-xs text-gray-400">~</span>
              <select
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="flex-1 min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs focus:border-[#1976D2] focus:outline-none appearance-none"
              >
                {TIME_OPTIONS.slice(1).map((t) => (
                  <option key={t} value={t}>{t.replace(/^0/, '')}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => { onApply(start, end); setOpen(false) }}
              className="mt-2 w-full cursor-pointer rounded-lg bg-[#1976D2] py-1.5 text-xs font-medium text-white hover:bg-[#1565C0] transition-colors"
            >
              적용
            </button>
          </div>
        </>
      )}
    </div>
  )
}
