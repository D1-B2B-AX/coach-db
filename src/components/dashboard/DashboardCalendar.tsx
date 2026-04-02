"use client"

import { isOff } from "@/lib/holidays"

interface DashboardCalendarProps {
  year: number
  month: number // 0-based
  selectedStart: string | null // "YYYY-MM-DD" (min of selectedDates)
  selectedEnd: string | null   // "YYYY-MM-DD" (max of selectedDates) or null
  selectedDates?: Set<string>  // individual selected dates for multi-select
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
}

const TIME_PRESETS = [
  { key: "all", label: "전체" },
  { key: "08-18", label: "오전+오후" },
  { key: "08-13", label: "오전" },
  { key: "13-18", label: "오후" },
  { key: "18-22", label: "저녁" },
]

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]


export default function DashboardCalendar({
  year,
  month,
  selectedStart,
  selectedEnd,
  selectedDates,
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
      {/* Time filter — preset buttons only */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {TIME_PRESETS.map((f) => (
          <button
            key={f.key}
            onClick={() => onTimeFilterChange(f.key)}
            className={`cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              timeFilter === f.key
                ? "bg-[#1976D2] text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={onRefresh}
          disabled={syncing}
          className={`cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
            syncing ? 'bg-[#E3F2FD] text-[#1976D2]' : 'bg-[#F5F5F5] text-gray-400 hover:bg-gray-200'
          }`}
        >
          {syncing ? "동기화 중..." : "새로고침"}
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
          const dow = new Date(year, month, dayNum).getDay() // 0=Sun
          const count = monthData[key] ?? 0
          const isToday = key === todayStr
          const isPast = key < todayStr
          const isSelected = selectedDates ? selectedDates.has(key) : (key === selectedStart || key === selectedEnd)
          const isInRange = !selectedDates && !!(selectedStart && selectedEnd && key > selectedStart && key < selectedEnd)
          const off = isOff(key, dow)

          let cellClasses =
            "flex flex-col items-center justify-center rounded-xl cursor-pointer transition-colors text-sm py-2.5 gap-0.5"

          if (isSelected) {
            cellClasses += " bg-[#1976D2] text-white"
          } else if (isInRange) {
            cellClasses += " bg-[#E3F2FD] text-[#1976D2]"
          } else if (isPast) {
            cellClasses += " opacity-35 hover:opacity-60"
          } else if (isToday) {
            cellClasses += " hover:bg-gray-50"
          } else {
            cellClasses += " hover:bg-gray-50"
          }

          let dayColor = isSelected ? "text-white" : "text-gray-700"
          if (!isSelected) {
            if (off) dayColor = "text-red-500"
          }

          return (
            <div
              key={key}
              className={cellClasses}
              onClick={() => onSelectDate(key)}
            >
              <span
                className={`text-sm font-medium ${dayColor}${isToday && !isSelected ? " text-base font-bold underline underline-offset-2" : ""}`}
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

