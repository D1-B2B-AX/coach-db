"use client"

import { ALL_SLOTS, formatRanges } from "./TimePanel"
import { isOff } from "@/lib/holidays"

const TIME_RANGES = [
  { label: "오전", start: "08:00", end: "13:00" },
  { label: "오후", start: "13:00", end: "18:00" },
  { label: "저녁", start: "18:00", end: "22:00" },
  { label: "전일", start: "08:00", end: "22:00" },
] as const

const CALENDAR_LEGEND_ITEMS = [
  {
    label: "가능",
    iconClass: "border border-[#4CAF50] bg-[#E8F5E9]",
  },
  {
    label: "확정",
    iconClass: "border border-[#1976D2] bg-[#1976D2]",
  },
  {
    label: "컨택중",
    iconClass: "border border-[#FFB74D] bg-white",
  },
  {
    label: "선택 중",
    iconClass: "border border-[#455A64] bg-white",
  },
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
  onBulkToggle?: (start: string, end: string) => void
  bulkStatus?: boolean[]
  scoutingDates?: Map<string, string>
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
  onBulkToggle,
  bulkStatus,
  scoutingDates,
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
            className="cursor-pointer rounded-lg border border-[#e0e0e0] px-2.5 py-1 text-sm text-[#666] hover:bg-gray-50 transition-colors"
          >
            &#8249; 이전
          </button>
        ) : <div className="w-[60px]" />}
        <span className="text-sm font-semibold text-[#333]">
          {year}년 {month + 1}월
        </span>
        {canGoNext ? (
          <button
            onClick={onNextMonth}
            className="cursor-pointer rounded-lg border border-[#e0e0e0] px-2.5 py-1 text-sm text-[#666] hover:bg-gray-50 transition-colors"
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
          const isScouted = scoutingDates?.has(key) ?? false
          const isSelected = selectedDay === key

          let cellClass =
            "aspect-square flex items-center justify-center rounded-[10px] text-base transition-all relative"

          if (past) {
            cellClass += " text-[#ccc] cursor-default"
          } else if (isSelected) {
            cellClass +=
              " bg-[#ECEFF1] border-2 border-[#546E7A] font-semibold cursor-pointer"
          } else if (isConfirmed) {
            cellClass +=
              " bg-[#1976D2] text-white font-semibold cursor-pointer hover:bg-[#1565C0]"
          } else if (isScouted && isAvailable) {
            cellClass +=
              " bg-[#E8F5E9] border-2 border-[#FFB74D] text-[#2E7D32] font-semibold cursor-pointer hover:bg-[#C8E6C9]"
          } else if (isScouted) {
            cellClass +=
              " border-2 border-[#FFB74D] font-semibold cursor-pointer hover:bg-gray-100"
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
            if (isOff(key, dayOfWeek)) cellClass += " text-[#E53935]"
            else if (dayOfWeek === 6) cellClass += " text-[#1565C0]"
          }

          if (isToday && !isSelected) {
            cellClass += " ring-2 ring-[#1976D2] text-[#0D47A1] font-semibold"
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
          <div key={key} className={cellClass} onClick={handleClick} title={isScouted ? `찜꽁중 (${scoutingDates!.get(key)} 매니저)` : undefined}>
              {d}
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-0.5 text-[10px] text-[#5f6b7a]">
        {CALENDAR_LEGEND_ITEMS.map(({ label, iconClass }) => (
          <div key={label} className="flex items-center gap-0.5">
            <span
              className={`inline-flex h-3 w-3 shrink-0 rounded-full ${iconClass}`}
              aria-hidden="true"
            />
            <span>{label}</span>
          </div>
        ))}
      </div>

      {/* Scouting notice for selected day */}
      {selectedDay && scoutingDates?.has(selectedDay) && (
        <div className="mt-3 rounded-lg bg-[#FFF8E1] border border-[#FFE082] px-3 py-2 text-sm">
          <span className="font-semibold text-[#E65100]">찜꽁중</span>
          {scoutingDates.get(selectedDay) && (
            <span className="text-[#795548]"> — {scoutingDates.get(selectedDay)} 매니저</span>
          )}
        </div>
      )}

      {/* Time buttons — below calendar, fixed position */}
      {selectedDay && !isPast(parseInt(selectedDay.split("-")[2])) && (
        <>
          <div className="mt-4">
            <div className="grid grid-cols-4 gap-1.5">
              {TIME_RANGES.map(({ label, start, end }) => {
                const rangeSlots = ALL_SLOTS.filter((s) => s >= start && s < end)
                const allSelected = rangeSlots.every(
                  (s) => selectedSlots.has(s) || confirmedSlots.has(s)
                )
                const isFullDay = label === "전일"
                const confirmed = isFullDay
                  ? rangeSlots.every((s) => confirmedSlots.has(s))
                  : rangeSlots.some((s) => confirmedSlots.has(s))
                return (
                  <button
                    key={label}
                    disabled={confirmed}
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
                      confirmed
                        ? "cursor-not-allowed border-[#1976D2] bg-[#E3F2FD] text-[#1976D2]"
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
                  약 {formatRanges(allSlots)}
                </div>
              ) : null
            })()}
          </div>
        </>
      )}

      {/* Bulk toggle */}
      {onBulkToggle && bulkStatus && (
        <div className="mt-5 flex items-center justify-center gap-1.5">
          <span className="text-xs text-gray-400">일괄 선택</span>
          {TIME_RANGES.map(({ label, start, end }, i) => (
            <button
              key={label}
              onClick={() => onBulkToggle(start, end)}
              className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                bulkStatus[i]
                  ? "border-[#4CAF50] bg-[#E8F5E9] text-[#2E7D32]"
                  : "border-[#e0e0e0] bg-white text-[#888] hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
