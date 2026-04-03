"use client"

import { isOff } from "@/lib/holidays"
import Button from "@/components/ui/Button"
import { SURFACE_CARD_CLASS } from "@/components/ui/styles"

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
  onReset: () => void
  syncing?: boolean
  timeFilter: string
  onTimeFilterChange: (filter: string) => void
}

const TIME_PRESETS = [
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
  onReset,
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
    <div className={`min-w-0 ${SURFACE_CARD_CLASS} p-4 sm:p-5`}>
      {/* Time filter — multi-select preset buttons */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {TIME_PRESETS.map((f) => {
            const activeKeys = timeFilter === "all" ? [] : timeFilter.split(",")
            const isActive = activeKeys.includes(f.key)
            return (
              <button
                key={f.key}
                onClick={() => {
                  let next: string[]
                  if (isActive) {
                    next = activeKeys.filter((k) => k !== f.key)
                  } else {
                    next = [...activeKeys, f.key]
                  }
                  onTimeFilterChange(next.length === 0 ? "all" : next.join(","))
                }}
                className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  isActive
                    ? "border-[#D6E7FA] bg-[#EAF3FE] text-[#1565C0]"
                    : "border-transparent bg-[#F6F8FB] text-gray-500 hover:bg-[#EDEFF3]"
                }`}
              >
                {f.label}
              </button>
            )
          })}
          {timeFilter !== "all" && (() => {
            const ranges = timeFilter.split(",").sort()
            const minH = Math.min(...ranges.map((r) => parseInt(r.split("-")[0])))
            const maxH = Math.max(...ranges.map((r) => parseInt(r.split("-")[1])))
            return (
              <span className="ml-1 hidden text-[10px] text-gray-400 md:inline">
                약 {minH}-{maxH}시
              </span>
            )
          })()}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            onClick={onReset}
            variant="secondary"
            size="sm"
            className="rounded-lg px-2.5 py-1 text-[11px] font-medium"
          >
            초기화
          </Button>
          <Button
            onClick={onRefresh}
            disabled={syncing}
            variant={syncing ? "primaryOutline" : "secondary"}
            size="sm"
            className="rounded-lg px-2.5 py-1 text-[11px] font-medium"
          >
            {syncing ? "동기화 중..." : "새로고침"}
          </Button>
        </div>
      </div>

      {/* Header row */}
      <div className="relative mb-4 flex items-center justify-center">
        <div className="flex items-center gap-2.5">
          {canGoPrev ? (
            <button
              onClick={onPrevMonth}
              className="cursor-pointer rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          ) : <div className="w-7" />}
          <h2 className="w-28 text-center text-sm font-semibold tabular-nums text-[#2F3640] sm:w-32 sm:text-sm">
            {yearMonthLabel}
          </h2>
          {canGoNext ? (
            <button
              onClick={onNextMonth}
              className="cursor-pointer rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
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
            className={`py-1.5 text-[11px] font-medium ${
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
      <div className="grid grid-cols-7 gap-[5px]">
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
            "relative flex flex-col items-center justify-center rounded-xl cursor-pointer transition-colors text-sm py-2 gap-0.5"

          if (isSelected) {
            cellClasses += " bg-[#EAF3FE] ring-1 ring-[#B7D4F6] text-[#1565C0]"
          } else if (isInRange) {
            cellClasses += " bg-[#F3F8FE] text-[#4A78A8]"
          } else if (isPast) {
            cellClasses += " opacity-35 hover:opacity-60"
          } else {
            cellClasses += " hover:bg-gray-50"
          }

          let dayColor = isSelected ? "text-[#1565C0]" : "text-gray-700"
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
                className={`text-sm font-medium ${dayColor}${isToday && !isSelected ? " font-semibold" : ""}`}
              >
                {dayNum}
              </span>
              {count > 0 ? (
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                    isSelected
                      ? "bg-white text-[#1565C0]"
                      : "bg-[#EAF3FE] text-[#1565C0]"
                  }`}
                >
                  {count}
                </span>
              ) : null}
              {isToday && !isSelected && (
                <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-[#1565C0]" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
