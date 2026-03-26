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
function formatRanges(slots: string[]): string {
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
  onToggleSlot: (slot: string) => void
  onSelectAll: () => void
  onClear: () => void
}

export default function TimePanel({
  month,
  day,
  selectedSlots,
  confirmedSlots,
  onToggleSlot,
  onSelectAll,
  onClear,
}: TimePanelProps) {
  const summaryParts = useMemo(() => {
    const parts: { label: string; text: string }[] = []
    const confirmedArr = [...confirmedSlots].sort()
    const selectedArr = [...selectedSlots].filter((s) => !confirmedSlots.has(s)).sort()
    if (confirmedArr.length > 0) parts.push({ label: "확정", text: formatRanges(confirmedArr) })
    if (selectedArr.length > 0) parts.push({ label: "가용", text: formatRanges(selectedArr) })
    return parts
  }, [selectedSlots, confirmedSlots])

  const isFullyConfirmed = confirmedSlots.size > 0 && [...selectedSlots].every(s => confirmedSlots.has(s))

  return (
    <div className="w-full max-w-[480px] rounded-2xl bg-white p-7 shadow-[0_2px_12px_rgba(0,0,0,0.08)] md:w-[280px]">
      <div className="mb-1 text-center text-[15px] font-semibold text-[#333]">
        {month}월 {day}일
      </div>
      {isFullyConfirmed ? (
        <div className="mb-3 text-center text-[12px] text-[#1976D2]">확정 일정 (변경 불가)</div>
      ) : null}
      <div className="mb-3 text-center text-[12px] text-[#888]">
        가능한 시간을 선택해주세요
      </div>

      {/* Quick select: time-of-day + clear */}
      <div className="mb-3 grid grid-cols-5 gap-1.5">
        {(
          [
            { label: "오전", start: "07:00", end: "12:00" },
            { label: "오후", start: "12:00", end: "18:00" },
            { label: "저녁", start: "18:00", end: "22:00" },
            { label: "종일", start: "07:00", end: "22:00" },
          ] as const
        ).map(({ label, start, end }) => {
          const rangeSlots = ALL_SLOTS.filter((s) => s >= start && s < end)
          const allSelected = rangeSlots.every(
            (s) => selectedSlots.has(s) || confirmedSlots.has(s)
          )
          return (
            <button
              key={label}
              onClick={() => {
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
              className={`cursor-pointer rounded-lg border py-2 text-[12px] font-semibold transition-all ${
                allSelected
                  ? "border-[#4CAF50] bg-[#E8F5E9] text-[#2E7D32]"
                  : "border-[#e0e0e0] bg-white text-[#888] hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          )
        })}
        <button
          onClick={onClear}
          className="cursor-pointer rounded-lg border border-[#e0e0e0] bg-white py-2 text-[12px] font-semibold text-[#999] transition-all hover:bg-gray-50"
        >
          초기화
        </button>
      </div>

      {/* Time grid */}
      <div className="grid grid-cols-2 gap-1.5">
        {ALL_SLOTS.map((slot) => {
          const isConfirmed = confirmedSlots.has(slot)
          const isSelected = selectedSlots.has(slot) && !isConfirmed

          let className =
            "cursor-pointer rounded-lg border px-1 py-[10px] text-center text-[13px] transition-all"

          if (isConfirmed) {
            className =
              "cursor-default rounded-lg border border-[#1976D2] bg-[#E3F2FD] px-1 py-[10px] text-center text-[13px] font-semibold text-[#1976D2]"
          } else if (isSelected) {
            className =
              "cursor-pointer rounded-lg border border-[#4CAF50] bg-[#E8F5E9] px-1 py-[10px] text-center text-[13px] font-semibold text-[#2E7D32] transition-all"
          } else {
            className =
              "cursor-pointer rounded-lg border border-[#e0e0e0] px-1 py-[10px] text-center text-[13px] text-[#888] transition-all hover:bg-gray-50"
          }

          return (
            <div
              key={slot}
              className={className}
              onClick={() => {
                if (!isConfirmed) onToggleSlot(slot)
              }}
            >
              {slotLabel(slot)}
            </div>
          )
        })}
      </div>

      {/* Summary */}
      <div className="mt-3 rounded-lg bg-[#f9f9f9] px-2.5 py-2 text-[11px] leading-relaxed text-[#666]">
        {summaryParts.length > 0 ? (
          summaryParts.map((p, i) => (
            <div key={i}>
              <strong>{p.label}:</strong> {p.text}
            </div>
          ))
        ) : (
          "시간을 선택해주세요"
        )}
      </div>
    </div>
  )
}
