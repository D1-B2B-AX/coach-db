"use client"

import { useMemo } from "react"
import { SURFACE_CARD_CLASS } from "@/components/ui/styles"

interface TrackCoach {
  coachId: string
  coachName: string
  isAuto: boolean
}

interface Track {
  trackName: string
  track: string
  className: string
  round: string
  startDate: string
  endDate: string
  coaches: TrackCoach[]
}

interface DxAssignmentCalendarProps {
  year: number
  month: number
  tracks: Track[]
  selectedTrack: string | null
  selectedDate: string | null
  onSelectTrack: (trackName: string, date: string) => void
  onPrevMonth: () => void
  onNextMonth: () => void
  onAutoAssign: () => void
  autoAssigning: boolean
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

const TRACK_COLORS = [
  { bg: "bg-blue-100/80", text: "text-blue-800", selected: "ring-blue-400" },
  { bg: "bg-emerald-100/80", text: "text-emerald-800", selected: "ring-emerald-400" },
  { bg: "bg-amber-100/80", text: "text-amber-800", selected: "ring-amber-400" },
  { bg: "bg-purple-100/80", text: "text-purple-800", selected: "ring-purple-400" },
  { bg: "bg-rose-100/80", text: "text-rose-800", selected: "ring-rose-400" },
  { bg: "bg-cyan-100/80", text: "text-cyan-800", selected: "ring-cyan-400" },
  { bg: "bg-orange-100/80", text: "text-orange-800", selected: "ring-orange-400" },
  { bg: "bg-indigo-100/80", text: "text-indigo-800", selected: "ring-indigo-400" },
]

interface TrackBar {
  trackName: string
  track: Track
  startCol: number
  span: number
  selectDate: string
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function buildWeeks(year: number, month: number): (number | null)[][] {
  const firstDayOfWeek = new Date(year, month, 1).getDay()
  const lastDate = new Date(year, month + 1, 0).getDate()
  const weeks: (number | null)[][] = []
  let week: (number | null)[] = []

  for (let i = 0; i < firstDayOfWeek; i++) week.push(null)
  for (let d = 1; d <= lastDate; d++) {
    week.push(d)
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null)
    weeks.push(week)
  }
  return weeks
}

function computeBarsForWeek(
  week: (number | null)[],
  tracks: Track[],
  year: number,
  month: number,
): TrackBar[] {
  const weekDates = week.map((d) => (d ? dateKey(year, month, d) : null))
  const bars: TrackBar[] = []

  for (const track of tracks) {
    let startCol = -1
    let endCol = -1
    let firstDate = ""

    for (let col = 0; col < 7; col++) {
      const ds = weekDates[col]
      if (!ds) continue
      if (ds >= track.startDate && ds <= track.endDate) {
        if (startCol === -1) {
          startCol = col
          firstDate = ds
        }
        endCol = col
      }
    }

    if (startCol !== -1) {
      bars.push({
        trackName: track.trackName,
        track,
        startCol: startCol + 1,
        span: endCol - startCol + 1,
        selectDate: firstDate,
      })
    }
  }

  return bars
}

export default function DxAssignmentCalendar({
  year,
  month,
  tracks,
  selectedTrack,
  selectedDate,
  onSelectTrack,
  onPrevMonth,
  onNextMonth,
  onAutoAssign,
  autoAssigning,
}: DxAssignmentCalendarProps) {
  const today = new Date()
  const todayStr = dateKey(today.getFullYear(), today.getMonth(), today.getDate())
  const allTrackNames = useMemo(() => [...new Set(tracks.map((t) => t.trackName))], [tracks])
  const weeks = useMemo(() => buildWeeks(year, month), [year, month])

  const barsByWeek = useMemo(
    () => weeks.map((w) => computeBarsForWeek(w, tracks, year, month)),
    [weeks, tracks, year, month],
  )

  function getColor(trackName: string) {
    const idx = allTrackNames.indexOf(trackName)
    return TRACK_COLORS[idx % TRACK_COLORS.length]
  }

  const yearMonthLabel = `${year}년 ${month + 1}월`

  return (
    <div className={`min-w-0 ${SURFACE_CARD_CLASS} p-4 sm:p-5`}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onPrevMonth}
            className="cursor-pointer rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="w-28 text-center text-sm font-semibold tabular-nums text-[#2F3640] sm:w-32">
            {yearMonthLabel}
          </h2>
          <button
            onClick={onNextMonth}
            className="cursor-pointer rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <button
          onClick={onAutoAssign}
          disabled={autoAssigning}
          className="cursor-pointer rounded-lg border border-[#1976D2] bg-[#1976D2] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#1565C0] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {autoAssigning ? "배정 중..." : "자동 배정"}
        </button>
      </div>

      {/* Legend */}
      {allTrackNames.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {allTrackNames.map((name) => {
            const color = getColor(name)
            return (
              <span
                key={name}
                className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium ${color.bg} ${color.text}`}
              >
                {name}
              </span>
            )
          })}
        </div>
      )}

      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-gray-100 pb-1 mb-1">
        {WEEKDAYS.map((w, i) => (
          <span
            key={w}
            className={`py-1 text-center text-[11px] font-medium ${
              i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-gray-400"
            }`}
          >
            {w}
          </span>
        ))}
      </div>

      {/* Week rows */}
      <div className="space-y-0">
        {weeks.map((week, wi) => {
          const bars = barsByWeek[wi]
          return (
            <div key={wi} className="border-b border-gray-50 last:border-b-0">
              {/* Date numbers */}
              <div className="grid grid-cols-7">
                {week.map((day, di) => {
                  if (day === null) return <div key={`e-${di}`} className="h-6" />
                  const key = dateKey(year, month, day)
                  const dow = di
                  const isToday = key === todayStr
                  return (
                    <div key={key} className="h-6 flex items-center justify-center">
                      <span
                        className={`text-[11px] font-medium ${
                          isToday
                            ? "flex h-5 w-5 items-center justify-center rounded-full bg-[#1565C0] text-white"
                            : dow === 0
                              ? "text-red-400"
                              : dow === 6
                                ? "text-blue-400"
                                : "text-gray-500"
                        }`}
                      >
                        {day}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Track bars */}
              {bars.length > 0 ? (
                <div className="pb-1.5 space-y-0.5">
                  {bars.map((bar) => {
                    const color = getColor(bar.trackName)
                    const isSelected =
                      selectedTrack === bar.trackName &&
                      selectedDate &&
                      selectedDate >= bar.track.startDate &&
                      selectedDate <= bar.track.endDate

                    return (
                      <div key={`${bar.trackName}-${bar.selectDate}`} className="grid grid-cols-7">
                        <button
                          onClick={() => onSelectTrack(bar.trackName, bar.selectDate)}
                          style={{ gridColumn: `${bar.startCol} / span ${bar.span}` }}
                          className={`cursor-pointer rounded-md px-1.5 py-1 text-left transition-all ${color.bg} ${color.text} ${
                            isSelected ? `ring-2 ${color.selected} shadow-sm` : "hover:brightness-95"
                          }`}
                        >
                          <span className="block truncate text-[10px] font-semibold leading-tight">
                            {bar.track.track} {bar.track.className}
                          </span>
                          {bar.track.coaches.length > 0 && (
                            <span className="block truncate text-[9px] font-normal opacity-75 leading-tight">
                              {bar.track.coaches.map((c) => c.coachName).join(", ")}
                            </span>
                          )}
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="h-1.5" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
