"use client"

import React, { useMemo, useState } from "react"
import { isHoliday } from "@/lib/holidays"
import type { Course } from "./utils"
import { DAY_NAMES, parseTimeRange, calcBreakAndTotal, formatScheduleLine } from "./utils"

interface EditCourseModalProps {
  course: Course
  saving: boolean
  onSave: (data: Partial<Course>) => void
  onDelete: () => void
  onClose: () => void
}

function formatWorkLine(dateStr: string, startTime: string, endTime: string): string {
  const date = new Date(dateStr + "T12:00:00Z")
  const dayName = DAY_NAMES[date.getUTCDay()]
  const { breakH, totalH } = calcBreakAndTotal(startTime, endTime)
  const breakStr = breakH >= 1 ? `${breakH}시간` : breakH === 0.5 ? "30분" : "없음"
  return `${dateStr}(${dayName}) ${startTime}-${endTime} (점심 휴게 ${breakStr}, ${totalH}H)`
}

interface DateChip {
  date: string
  dayOfMonth: number
  dayName: string
  isOff: boolean
}

function buildDateChips(startDate: string, endDate: string): DateChip[] {
  if (!startDate || !endDate) return []

  const dates: DateChip[] = []
  const cursor = new Date(startDate + "T12:00:00Z")
  const end = new Date(endDate + "T12:00:00Z")

  while (cursor <= end) {
    const dateStr = cursor.toISOString().slice(0, 10)
    const dow = cursor.getUTCDay()
    dates.push({
      date: dateStr,
      dayOfMonth: cursor.getUTCDate(),
      dayName: DAY_NAMES[dow],
      isOff: dow === 0 || dow === 6 || isHoliday(dateStr),
    })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return dates
}

function parseExistingWorkHours(workHours: string | null | undefined): { selectedDates: Set<string>; dateTimes: Record<string, string>; defaultTime: string } {
  const selectedDates = new Set<string>()
  const dateTimes: Record<string, string> = {}

  for (const line of (workHours || "").split("\n")) {
    const m = line.match(/^(\d{4}-\d{2}-\d{2})\(.+?\)\s+(\d{2}:\d{2})-(\d{2}:\d{2})/)
    if (m) {
      selectedDates.add(m[1])
      dateTimes[m[1]] = `${m[2]}~${m[3]}`
    }
  }

  return {
    selectedDates,
    dateTimes,
    defaultTime: Object.values(dateTimes)[0] || "",
  }
}

function getDefaultSelectedDates(dateChips: DateChip[], dateTimes: Record<string, string>, current?: Set<string>): Set<string> {
  const chipDates = new Set(dateChips.map((d) => d.date))
  const preserved = current ? [...current].filter((date) => chipDates.has(date)) : []
  if (preserved.length > 0) return new Set(preserved)

  const prefilled = Object.keys(dateTimes).filter((date) => chipDates.has(date))
  if (prefilled.length > 0) return new Set(prefilled)

  return new Set(dateChips.filter((d) => !d.isOff).map((d) => d.date))
}

export default function EditCourseModal({ course, saving, onSave, onDelete, onClose }: EditCourseModalProps) {
  const initialSchedule = parseExistingWorkHours(course.workHours)
  const initialDateChips = buildDateChips(course.startDate?.slice(0, 10) || "", course.endDate?.slice(0, 10) || "")
  const [name, setName] = useState(course.name)
  const [desc, setDesc] = useState(course.description || "")
  const [startDate, setStartDate] = useState(course.startDate?.slice(0, 10) || "")
  const [endDate, setEndDate] = useState(course.endDate?.slice(0, 10) || "")
  const [location, setLocation] = useState(course.location || "")
  const [hourlyRate, setHourlyRate] = useState(
    course.hourlyRate !== null && course.hourlyRate !== undefined ? String(course.hourlyRate) : ""
  )

  // Schedule builder state
  const [defaultTime, setDefaultTime] = useState(initialSchedule.defaultTime)
  const [selectedDates, setSelectedDates] = useState<Set<string>>(() =>
    getDefaultSelectedDates(initialDateChips, initialSchedule.dateTimes, initialSchedule.selectedDates)
  )
  const [dateTimes, setDateTimes] = useState<Record<string, string>>(initialSchedule.dateTimes)
  const [remarks, setRemarks] = useState(course.remarks || "")

  // Generate date chips from start/end
  const dateChips = useMemo(() => {
    return buildDateChips(startDate, endDate)
  }, [startDate, endDate])

  // Week groups for visual layout
  const weekGroups = useMemo(() => {
    const groups: typeof dateChips[] = []
    let current: typeof dateChips = []
    for (let i = 0; i < dateChips.length; i++) {
      current.push(dateChips[i])
      if (i < dateChips.length - 1) {
        const curr = new Date(dateChips[i].date + "T12:00:00Z")
        const next = new Date(dateChips[i + 1].date + "T12:00:00Z")
        if ((next.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24) > 1) {
          groups.push(current)
          current = []
        }
      }
    }
    if (current.length > 0) groups.push(current)
    return groups
  }, [dateChips])

  // Generate output lines
  const outputLines = useMemo(() => {
    if (selectedDates.size === 0) return []
    return dateChips
      .filter(d => selectedDates.has(d.date))
      .map(d => {
        const t = parseTimeRange(dateTimes[d.date]?.trim() || defaultTime)
        if (!t) return null
        return formatWorkLine(d.date, t.start, t.end)
      })
      .filter((l): l is string => l !== null)
  }, [dateChips, selectedDates, dateTimes, defaultTime])

  // 미리보기 텍스트
  const previewLines = useMemo(() => {
    if (selectedDates.size === 0) return []
    return dateChips
      .filter(d => selectedDates.has(d.date))
      .map(d => {
        const t = parseTimeRange(dateTimes[d.date]?.trim() || defaultTime)
        if (!t) return null
        return formatScheduleLine(d.date, t.start, t.end)
      })
      .filter((l): l is string => l !== null)
  }, [dateChips, selectedDates, dateTimes, defaultTime])

  function toggleDate(dateStr: string) {
    setSelectedDates(prev => {
      const next = new Set(prev)
      if (next.has(dateStr)) next.delete(dateStr)
      else next.add(dateStr)
      return next
    })
  }

  function applyTimeToAll(time: string) {
    setDefaultTime(time)
    setDateTimes(prev => {
      const next = { ...prev }
      for (const d of dateChips) {
        if (selectedDates.has(d.date)) next[d.date] = time
      }
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

  function handleSave() {
    if (!name.trim()) return
    const parsedHourlyRate = hourlyRate.trim() ? Number(hourlyRate) : null
    if (parsedHourlyRate !== null && (!Number.isFinite(parsedHourlyRate) || parsedHourlyRate < 0)) {
      alert("시급은 0 이상의 숫자로 입력해주세요.")
      return
    }
    onSave({
      name: name.trim(),
      description: desc.trim() || null,
      startDate: startDate || null,
      endDate: endDate || null,
      workHours: outputLines.length > 0 ? outputLines.join("\n") : null,
      location: location.trim() || null,
      hourlyRate: parsedHourlyRate,
      remarks: remarks.trim() || null,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={() => !saving && onClose()}
    >
      <div
        className="w-full max-w-[560px] max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-[#333]">과정 수정</h3>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">과정명</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              disabled={saving}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-[#333] focus:border-[#1976D2] focus:outline-none"
            />
          </label>

          {/* 기간 */}
          <div>
            <span className="mb-1 block text-xs font-medium text-gray-600">기간</span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                disabled={saving}
                className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-[#333] focus:border-[#1976D2] focus:outline-none"
              />
              <span className="text-xs text-gray-400">~</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => handleEndDateChange(e.target.value)}
                disabled={saving}
                className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-[#333] focus:border-[#1976D2] focus:outline-none"
              />
            </div>
          </div>

          {/* 근무시간 — 날짜별 스케줄 빌더 */}
          <div>
            <span className="mb-1 block text-xs font-medium text-gray-600">근무시간</span>
            {dateChips.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-400">
                기간을 설정하면 날짜별 근무시간을 지정할 수 있습니다
              </div>
            ) : (
              <div className="space-y-2">
                {/* 기본 시간 + 프리셋 */}
                <div className="flex items-center gap-1.5 flex-wrap rounded-lg bg-gray-50 px-2.5 py-2">
                  <span className="text-[11px] text-gray-400 shrink-0">일괄 입력</span>
                  <input
                    type="text"
                    value={defaultTime}
                    onChange={(e) => applyTimeToAll(e.target.value)}
                    placeholder=""
                    disabled={saving}
                    className="w-28 rounded-lg border border-gray-200 px-2 py-1 text-[11px] text-[#333] focus:border-[#1976D2] focus:outline-none"
                  />
                  {["09:00~18:00", "08:30~17:30"].map((v) => (
                    <button
                      key={v}
                      type="button"
                      disabled={saving}
                      onClick={() => applyTimeToAll(v)}
                      className={`cursor-pointer rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
                        defaultTime === v
                          ? "bg-[#1976D2] text-white"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>

                {/* 날짜 칩 — 주별 그룹 */}
                {weekGroups.map((wg, gi) => (
                  <div key={gi} className="flex items-center gap-1 flex-wrap">
                    {wg.map((d) => {
                      const sel = selectedDates.has(d.date)
                      return (
                        <div key={d.date} className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => toggleDate(d.date)}
                            disabled={saving}
                            className={`cursor-pointer rounded-l-lg px-1.5 py-1 text-[11px] font-semibold transition-colors ${
                              sel
                                ? "bg-[#1976D2] text-white"
                                : d.isOff
                                  ? "bg-red-50 text-red-300"
                                  : "bg-gray-100 text-gray-300"
                            }`}
                          >
                            {d.dayOfMonth}({d.dayName})
                          </button>
                          {sel && (
                            <input
                              type="text"
                              value={dateTimes[d.date] || ""}
                              onChange={(e) => setDateTimes(prev => ({ ...prev, [d.date]: e.target.value }))}
                              placeholder={defaultTime}
                              disabled={saving}
                              className="w-24 rounded-r-lg border border-l-0 border-gray-200 px-1.5 py-1 text-[11px] text-[#333] placeholder:text-gray-300 focus:border-[#1976D2] focus:outline-none"
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}

              </div>
            )}

            {/* 미리보기 */}
            {previewLines.length > 0 && (
              <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="mb-1 text-[10px] font-medium text-gray-400">미리보기</div>
                <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-[#333]">{previewLines.join("\n")}</pre>
              </div>
            )}
          </div>

          {/* 장소 + 시급 */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">장소</span>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="예: 강남 본사"
                disabled={saving}
                className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-[#333] focus:border-[#1976D2] focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">시급</span>
              <input
                type="number"
                min="0"
                step="100"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="예: 15000"
                disabled={saving}
                className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-[#333] focus:border-[#1976D2] focus:outline-none"
              />
            </label>
          </div>

          {/* 과정 내용 */}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">과정 내용</span>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="코치에게 보여질 과정 설명을 입력하세요"
              rows={3}
              disabled={saving}
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-[#333] focus:border-[#1976D2] focus:outline-none"
            />
          </label>

          {/* 비고 */}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">비고</span>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="예: 식사 제공"
              disabled={saving}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-[#333] focus:border-[#1976D2] focus:outline-none"
            />
          </label>
        </div>

        {/* 하단 버튼 */}
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={onDelete}
            disabled={saving}
            className="cursor-pointer rounded-lg px-3 py-2 text-sm text-red-500 hover:bg-red-50 disabled:opacity-50"
          >
            삭제
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="cursor-pointer rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="cursor-pointer rounded-lg bg-[#1976D2] px-3 py-2 text-sm font-medium text-white hover:bg-[#1565C0] disabled:opacity-50"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
