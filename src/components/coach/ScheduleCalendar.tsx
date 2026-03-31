"use client"

import { ALL_SLOTS, formatRanges } from "./TimePanel"

const TIME_RANGES = [
  { label: "오전", start: "08:00", end: "13:00" },
  { label: "오후", start: "13:00", end: "18:00" },
  { label: "저녁", start: "18:00", end: "22:00" },
  { label: "종일", start: "08:00", end: "22:00" },
] as const

interface ScheduleCalendarProps {
  year: number
  month: number // 0-based (JS Date convention)
  selectedDay: string | null // "YYYY-MM-DD"
  availableDates: Set<string> // dates with schedule entries
  confirmedDates: Set<string> // dates with confirmed engagements
  unavailableDates: Set<string> // dates marked as unavailable
  selectedSlots: Set<string> // currently selected slots for the selected day
  confirmedSlots: Set<string> // confirmed engagement slots for the selected day
  onSelectDay: (dateKey: string, day: number) => void
  onConfirmedClick: (dateKey: string) => void
  onToggleSlot: (slot: string) => void
  onPrevMonth: () => void
  onNextMonth: () => void
  canGoPrev?: boolean
  canGoNext?: boolean
}

export default function ScheduleCalendar({
  year,
  month,
  selectedDay,
  availableDates,
  confirmedDates,
  unavailableDates,
  onSelectDay,
  onConfirmedClick,
  onToggleSlot,
  onPrevMonth,
  onNextMonth,
  canGoPrev = true,
  canGoNext = true,
  selectedSlots,
  confirmedSlots,
}: ScheduleCalendarProps) {
  const firstDayOfWeek = new Date(year, month, 1).getDay()
  const lastDate = new Date(year, month + 1, 0).getDate()
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`

  function dateKey(d: number): string {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
  }

  function isPast(d: number): boolean {
    const date = new Date(year, month, d)
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    return date < todayStart
  }

  return (
    <div>
      {/* Month navigation */}
      <div className="mb-4 flex items-center justify-between">
        {canGoPrev ? (
          <button
            onClick={onPrevMonth}
            className="cursor-pointer rounded-lg border border-[#e0e0e0] px-3.5 py-1.5 text-base text-[#666] hover:bg-gray-50 transition-colors"
          >
            &#8249; 이전
          </button>
        ) : <div className="w-[72px]" />}
        <span className="text-base font-semibold text-[#333]">
          {year}년 {month + 1}월
        </span>
        {canGoNext ? (
          <button
            onClick={onNextMonth}
            className="cursor-pointer rounded-lg border border-[#e0e0e0] px-3.5 py-1.5 text-base text-[#666] hover:bg-gray-50 transition-colors"
          >
            다음 &#8250;
          </button>
        ) : <div className="w-[72px]" />}
      </div>

      {/* Weekday headers */}
      <div className="mb-2 grid grid-cols-7 text-center">
        {["일", "월", "화", "수", "목", "금", "토"].map((w, i) => (
          <span
            key={w}
            className={`py-2 text-sm ${
              i === 0 ? "text-[#E53935]" : i === 6 ? "text-[#1565C0]" : "text-[#999]"
            }`}
          >
            {w}
          </span>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-[4px]">
        {/* Empty cells for offset */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} className="aspect-square" />
        ))}

        {/* Day cells */}
        {Array.from({ length: lastDate }).map((_, i) => {
          const d = i + 1
          const key = dateKey(d)
          const dayOfWeek = new Date(year, month, d).getDay()
          const past = isPast(d)
          const isToday = key === todayStr
          const isConfirmed = confirmedDates.has(key)
          const isAvailable = availableDates.has(key)
          const isUnavailable = unavailableDates.has(key)
          const isSelected = selectedDay === key

          let cellClass =
            "aspect-square flex items-center justify-center rounded-[10px] text-base transition-all relative"

          if (past) {
            cellClass += " text-[#ccc] cursor-default"
          } else if (isSelected) {
            cellClass +=
              " bg-[#FFF3E0] border-2 border-[#FF9800] font-semibold cursor-pointer"
          } else if (isConfirmed) {
            cellClass +=
              " bg-[#1976D2] text-white font-semibold cursor-pointer hover:bg-[#1565C0]"
          } else if (isUnavailable) {
            cellClass +=
              " bg-[#FBE9E7] text-[#D84315] font-semibold cursor-pointer hover:bg-[#FFCCBC]"
          } else if (isAvailable) {
            cellClass +=
              " bg-[#E8F5E9] text-[#2E7D32] font-semibold cursor-pointer hover:bg-[#C8E6C9]"
          } else {
            cellClass += " cursor-pointer hover:bg-gray-100"
          }

          if (!isConfirmed && !past && !isSelected) {
            if (dayOfWeek === 0) cellClass += " text-[#E53935]"
            if (dayOfWeek === 6) cellClass += " text-[#1565C0]"
          }

          if (isToday && !isSelected) {
            cellClass += " border-2 border-[#333]"
          }

          const handleClick = () => {
            if (past) return
            if (isConfirmed) {
              onConfirmedClick(key)
            } else {
              onSelectDay(key, d)
            }
          }

          return (
            <div key={key} className={cellClass} onClick={handleClick}>
              {d}
            </div>
          )
        })}
      </div>

      {/* Time buttons — below calendar, fixed position */}
      {selectedDay && !isPast(parseInt(selectedDay.split("-")[2])) && (
        <div className="mt-4">
          <div className="grid grid-cols-4 gap-1.5">
            {TIME_RANGES.map(({ label, start, end }) => {
              const rangeSlots = ALL_SLOTS.filter((s) => s >= start && s < end)
              const allSelected = rangeSlots.every(
                (s) => selectedSlots.has(s) || confirmedSlots.has(s)
              )
              const allConfirmed = rangeSlots.every((s) => confirmedSlots.has(s))
              return (
                <button
                  key={label}
                  disabled={allConfirmed}
                  onClick={() => {
                    if (allSelected) {
                      for (const s of rangeSlots) {
                        if (!confirmedSlots.has(s) && selectedSlots.has(s)) onToggleSlot(s)
                      }
                    } else {
                      for (const s of rangeSlots) {
                        if (!confirmedSlots.has(s) && !selectedSlots.has(s)) onToggleSlot(s)
                      }
                    }
                  }}
                  className={`rounded-lg border py-2 text-xs font-semibold transition-all ${
                    allConfirmed
                      ? "cursor-not-allowed border-[#e0e0e0] bg-gray-50 text-[#ccc]"
                      : allSelected
                        ? "cursor-pointer border-[#4CAF50] bg-[#E8F5E9] text-[#2E7D32]"
                        : "cursor-pointer border-[#e0e0e0] bg-white text-[#888] hover:bg-gray-50"
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
          {(() => {
            const allSlots = [...selectedSlots].filter(s => !confirmedSlots.has(s)).sort()
            return allSlots.length > 0 ? (
              <div className="mt-2 text-center text-xs text-[#2E7D32]">
                {formatRanges(allSlots)}
              </div>
            ) : null
          })()}
        </div>
      )}

      {/* Legend */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-xs text-[#888]">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-[4px] border border-[#A5D6A7] bg-[#E8F5E9]" />
          가용
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-[4px] bg-[#1976D2]" />
          확정
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-[4px] border-2 border-[#FF9800] bg-[#FFF3E0]" />
          선택 중
        </div>
      </div>
    </div>
  )
}
