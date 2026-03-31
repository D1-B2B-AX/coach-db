"use client"

import { useMemo } from "react"

// Generate 30 half-hour slots from 07:00 to 22:00
export const ALL_SLOTS: string[] = []
for (let h = 7; h <= 21; h++) {
  ALL_SLOTS.push(`${String(h).padStart(2, "0")}:00`)
  ALL_SLOTS.push(`${String(h).padStart(2, "0")}:30`)
}

function slotLabel(slot: string): string {
  const [hStr, mStr] = slot.split(":")
  const h = parseInt(hStr)
  const m = parseInt(mStr)
  let endH = h
  let endM = m + 30
  if (endM >= 60) {
    endH += 1
    endM = 0
  }
  return `${slot}~${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`
}

/** Group consecutive 30-min slots into time range strings */
export function formatRanges(slots: string[]): string {
  if (slots.length === 0) return ""
  if (slots.length === ALL_SLOTS.length) return "종일 (08:00~22:00)"

  const sorted = [...slots].sort()
  const ranges: string[] = []
  let start = sorted[0]
  let prev = sorted[0]

  for (let i = 1; i < sorted.length; i++) {
    const prevIdx = ALL_SLOTS.indexOf(prev)
    const curIdx = ALL_SLOTS.indexOf(sorted[i])
    if (curIdx === prevIdx + 1) {
      prev = sorted[i]
    } else {
      // Close previous range
      ranges.push(`${start}~${endOfSlot(prev)}`)
      start = sorted[i]
      prev = sorted[i]
    }
  }
  ranges.push(`${start}~${endOfSlot(prev)}`)
  return ranges.join(", ")
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

interface TimePanelProps {
  month: number // 1-based
  day: number
  selectedSlots: Set<string>
  confirmedSlots: Set<string>
  confirmedCourseNames?: string[]
  isUnavailable: boolean
  onToggleSlot: (slot: string) => void
  onSelectAll: () => void
  onClear: () => void
  onToggleUnavailable: () => void
}

export default function TimePanel({
  month,
  day,
  selectedSlots,
  confirmedSlots,
  confirmedCourseNames,
  isUnavailable,
  onToggleSlot,
  onSelectAll,
  onClear,
  onToggleUnavailable,
}: TimePanelProps) {
  const summaryParts = useMemo(() => {
    const parts: { label: string; text: string }[] = []
    const confirmedArr = [...confirmedSlots].sort()
    const selectedArr = [...selectedSlots].filter((s) => !confirmedSlots.has(s)).sort()
    if (confirmedArr.length > 0) {
      const courseText = confirmedCourseNames?.length ? ` · ${confirmedCourseNames.join(", ")}` : ""
      parts.push({ label: "확정", text: formatRanges(confirmedArr) + courseText })
    }
    if (selectedArr.length > 0) parts.push({ label: "가용", text: formatRanges(selectedArr) })
    return parts
  }, [selectedSlots, confirmedSlots, confirmedCourseNames])

  const isFullyConfirmed = confirmedSlots.size > 0 && [...selectedSlots].every(s => confirmedSlots.has(s))

  return (
    <div className="w-full max-w-[480px] rounded-2xl bg-white p-7 shadow-[0_2px_12px_rgba(0,0,0,0.08)] md:w-[280px]">
      <div className="mb-1 text-center text-[15px] font-semibold text-[#333]">
        {month}월 {day}일
      </div>
      {/* Course names now shown inline with confirmed time range */}
      <div className="mb-3 text-center text-[12px] text-[#888]">
        시간을 선택하거나 불가를 눌러주세요
      </div>

      {/* Quick select: time-of-day + clear */}
      <div className="mb-3 grid grid-cols-4 gap-1.5">
        {(
          [
            { label: "오전", start: "07:00", end: "13:00" },
            { label: "오후", start: "13:00", end: "18:00" },
            { label: "야간", start: "18:00", end: "22:00" },
            { label: "종일", start: "07:00", end: "22:00" },
          ] as const
        ).map(({ label, start, end }) => {
          const rangeSlots = ALL_SLOTS.filter((s) => s >= start && s < end)
          const allSelected = !isUnavailable && rangeSlots.every(
            (s) => selectedSlots.has(s) || confirmedSlots.has(s)
          )
          return (
            <button
              key={label}
              disabled={isUnavailable}
              onClick={() => {
                if (isUnavailable) return
                if (allSelected) {
                  for (const s of rangeSlots) {
                    if (!confirmedSlots.has(s) && selectedSlots.has(s)) {
                      onToggleSlot(s)
                    }
                  }
                } else {
                  for (const s of rangeSlots) {
                    if (!confirmedSlots.has(s) && !selectedSlots.has(s)) {
                      onToggleSlot(s)
                    }
                  }
                }
              }}
              className={`rounded-lg border py-2 text-[12px] font-semibold transition-all ${
                isUnavailable
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


      {/* Summary — 확정 과정명 + 가용시간만 표시 */}
      {summaryParts.length > 0 && !isUnavailable && (
        <div className="mt-3 rounded-lg bg-[#f9f9f9] px-2.5 py-2 text-[11px] leading-relaxed text-[#666]">
          {summaryParts.map((p, i) => (
            <div key={i}>
              <strong>{p.label}:</strong> {p.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
