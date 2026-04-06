"use client"

import React, { useState, useRef, useMemo, useEffect } from "react"
import { isHoliday } from "@/lib/holidays"
import { Course, DeletedCourse, Scouting, STATUS_CONFIG, formatPeriod, getStatusCounts, DAY_NAMES, parseTimeRange, calcBreakAndTotal, formatScheduleLine } from "./utils"

interface CourseTabProps {
  courses: Course[]
  deletedCourses: DeletedCourse[]
  scoutings: Scouting[]
  onCourseCreate: (name: string, startDate?: string, endDate?: string) => Promise<void>
  onCourseUpdate: (id: string, data: Partial<Course>) => Promise<void>
  onCourseDelete: (id: string) => Promise<void>
}

function formatWorkLine(dateStr: string, startTime: string, endTime: string): string {
  const date = new Date(dateStr + "T12:00:00Z")
  const dayName = DAY_NAMES[date.getUTCDay()]
  const { breakH, totalH } = calcBreakAndTotal(startTime, endTime)
  const breakStr = breakH >= 1 ? `${breakH}시간` : breakH === 0.5 ? "30분" : "없음"
  return `${dateStr}(${dayName}) ${startTime}-${endTime} (점심 휴게 ${breakStr}, ${totalH}H)`
}

// Inline edit form for a course card
function CourseEditForm({ course, saving, hasAcceptedScoutings, hasConfirmedScoutings, onSave, onCancel }: {
  course: Course
  saving: boolean
  hasAcceptedScoutings?: boolean
  hasConfirmedScoutings?: boolean
  onSave: (data: Partial<Course>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(course.name)
  const [desc, setDesc] = useState(course.description || "")
  const [startDate, setStartDate] = useState(course.startDate?.slice(0, 10) || "")
  const [endDate, setEndDate] = useState(course.endDate?.slice(0, 10) || "")
  const [location, setLocation] = useState(course.location || "")
  const [hourlyRate, setHourlyRate] = useState(
    course.hourlyRate !== null && course.hourlyRate !== undefined ? String(course.hourlyRate) : ""
  )
  const [defaultTime, setDefaultTime] = useState(() => {
    const existing = course.workHours || ""
    for (const line of existing.split("\n")) {
      const m = line.match(/^(\d{4}-\d{2}-\d{2})\(.+?\)\s+(\d{2}:\d{2})-(\d{2}:\d{2})/)
      if (m) return `${m[2]}~${m[3]}`
    }
    return "09:00~18:00"
  })
  const [selectedDates, setSelectedDates] = useState<Set<string>>(() => new Set())
  const [dateTimes, setDateTimes] = useState<Record<string, string>>(() => ({}))
  const [remarks, setRemarks] = useState(course.remarks || "")

  const dateChips = useMemo(() => {
    if (!startDate || !endDate) return []
    const dates: { date: string; dayOfMonth: number; dayName: string; isOff: boolean }[] = []
    const cursor = new Date(startDate + "T12:00:00Z")
    const end = new Date(endDate + "T12:00:00Z")
    while (cursor <= end) {
      const dateStr = cursor.toISOString().slice(0, 10)
      const dow = cursor.getUTCDay()
      dates.push({ date: dateStr, dayOfMonth: cursor.getUTCDate(), dayName: DAY_NAMES[dow], isOff: dow === 0 || dow === 6 || isHoliday(dateStr) })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    return dates
  }, [startDate, endDate])

  const weekGroups = useMemo(() => {
    const groups: typeof dateChips[] = []
    let current: typeof dateChips = []
    for (let i = 0; i < dateChips.length; i++) {
      current.push(dateChips[i])
      if (i < dateChips.length - 1) {
        const curr = new Date(dateChips[i].date + "T12:00:00Z")
        const next = new Date(dateChips[i + 1].date + "T12:00:00Z")
        if ((next.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24) > 1) { groups.push(current); current = [] }
      }
    }
    if (current.length > 0) groups.push(current)
    return groups
  }, [dateChips])

  useEffect(() => {
    if (dateChips.length === 0) {
      setSelectedDates(new Set())
      return
    }
    const existing = course.workHours || ""
    const existingDates = new Set<string>()
    const existingTimes: Record<string, string> = {}
    for (const line of existing.split("\n")) {
      const m = line.match(/^(\d{4}-\d{2}-\d{2})\(.+?\)\s+(\d{2}:\d{2})-(\d{2}:\d{2})/)
      if (m) { existingDates.add(m[1]); existingTimes[m[1]] = `${m[2]}~${m[3]}` }
    }
    if (existingDates.size > 0) {
      // Use functional updates to avoid synchronous setState-in-effect lint error
      setSelectedDates(() => existingDates)
      setDateTimes(() => existingTimes)
    } else {
      setSelectedDates(() => new Set(dateChips.filter(d => !d.isOff).map(d => d.date)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate])

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

  function applyTimeToAll(time: string) {
    setDefaultTime(time)
    setDateTimes(prev => {
      const next = { ...prev }
      for (const d of dateChips) { if (selectedDates.has(d.date)) next[d.date] = time }
      return next
    })
  }

  function handleSave() {
    if (!name.trim()) return
    const parsedHourlyRate = hourlyRate.trim() ? Number(hourlyRate) : null
    if (parsedHourlyRate !== null && (!Number.isFinite(parsedHourlyRate) || parsedHourlyRate < 0)) {
      alert("시급은 0 이상의 숫자로 입력해주세요.")
      return
    }
    const resetMsg = hasConfirmedScoutings
      ? "확정이 취소되고,\n다시 요청 알림이 갑니다. 계속하시겠습니까?"
      : "찜꽁 수락이 취소되고\n다시 요청 알림이 갑니다. 계속하시겠습니까?"
    if (hasAcceptedScoutings && !confirm(resetMsg)) {
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
    <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-600">과정명</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} disabled={saving}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-[#333] focus:border-[#1976D2] focus:outline-none" />
      </label>

      <div>
        <span className="mb-1 block text-xs font-medium text-gray-600">기간</span>
        <div className="flex items-center gap-2">
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={saving}
            className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-[#333] focus:border-[#1976D2] focus:outline-none" />
          <span className="text-xs text-gray-400">~</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={saving}
            className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-[#333] focus:border-[#1976D2] focus:outline-none" />
        </div>
      </div>

      <div>
        <span className="mb-1 block text-xs font-medium text-gray-600">근무시간</span>
        {dateChips.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-400">
            기간을 설정하면 날짜별 근무시간을 지정할 수 있습니다
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 flex-wrap rounded-lg bg-gray-50 px-2.5 py-2">
              <span className="text-[11px] text-gray-400 shrink-0">일괄 입력</span>
              <input type="text" value={defaultTime} onChange={(e) => applyTimeToAll(e.target.value)} placeholder="09:00~18:00" disabled={saving}
                className="w-28 rounded-lg border border-gray-200 px-2 py-1 text-[11px] text-[#333] focus:border-[#1976D2] focus:outline-none" />
              {["09:00~18:00", "08:30~17:30"].map((v) => (
                <button key={v} type="button" disabled={saving} onClick={() => applyTimeToAll(v)}
                  className={`cursor-pointer rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${defaultTime === v ? "bg-[#1976D2] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                  {v}
                </button>
              ))}
            </div>
            {weekGroups.map((wg, gi) => (
              <div key={gi} className="flex items-center gap-1 flex-wrap">
                {wg.map((d) => {
                  const sel = selectedDates.has(d.date)
                  return (
                    <div key={d.date} className="flex items-center gap-0.5">
                      <button type="button" disabled={saving}
                        onClick={() => setSelectedDates(prev => { const next = new Set(prev); if (next.has(d.date)) next.delete(d.date); else next.add(d.date); return next })}
                        className={`cursor-pointer rounded-l-lg px-1.5 py-1 text-[11px] font-semibold transition-colors ${sel ? "bg-[#1976D2] text-white" : d.isOff ? "bg-red-50 text-red-300" : "bg-gray-100 text-gray-300"}`}>
                        {d.dayOfMonth}({d.dayName})
                      </button>
                      {sel && (
                        <input type="text" value={dateTimes[d.date] || ""} onChange={(e) => setDateTimes(prev => ({ ...prev, [d.date]: e.target.value }))}
                          placeholder={defaultTime} disabled={saving}
                          className="w-24 rounded-r-lg border border-l-0 border-gray-200 px-1.5 py-1 text-[11px] text-[#333] placeholder:text-gray-300 focus:border-[#1976D2] focus:outline-none" />
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-600">장소</span>
          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="예: 강남 본사" disabled={saving}
            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-[#333] focus:border-[#1976D2] focus:outline-none" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-600">시급</span>
          <input type="number" min="0" step="100" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} placeholder="예: 15000" disabled={saving}
            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-[#333] focus:border-[#1976D2] focus:outline-none" />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-600">과정 내용</span>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="코치에게 보여질 과정 설명을 입력하세요" rows={3} disabled={saving}
          className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-[#333] focus:border-[#1976D2] focus:outline-none" />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-600">비고</span>
        <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="예: 식사 제공" disabled={saving}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-[#333] focus:border-[#1976D2] focus:outline-none" />
      </label>

      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} disabled={saving}
          className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          취소
        </button>
        <button onClick={handleSave} disabled={saving || !name.trim()}
          className="cursor-pointer rounded-lg bg-[#1976D2] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#1565C0] disabled:opacity-50">
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  )
}

export default function CourseTab({ courses, deletedCourses, scoutings, onCourseCreate, onCourseUpdate, onCourseDelete }: CourseTabProps) {
  const [newName, setNewName] = useState("")
  const [newStart, setNewStart] = useState("")
  const [newEnd, setNewEnd] = useState("")
  const [creating, setCreating] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const dateInvalid = newStart && newEnd && newStart > newEnd

  async function handleCreate() {
    if (!newName.trim() || dateInvalid) return
    setCreating(true)
    try {
      await onCourseCreate(newName.trim(), newStart || undefined, newEnd || undefined)
      setNewName("")
      setNewStart("")
      setNewEnd("")
      nameInputRef.current?.focus()
    } finally {
      setCreating(false)
    }
  }

  async function handleSave(id: string, data: Partial<Course>) {
    setSaving(true)
    try {
      await onCourseUpdate(id, data)
      setEditId(null)
    } finally {
      setSaving(false)
    }
  }

  const [showDeleted, setShowDeleted] = useState(false)
  const sorted = [...courses].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return (
    <div className="space-y-3">
      {/* Inline fast creation row */}
      <div className="flex items-center gap-2 flex-wrap rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100 px-4 py-3">
        <input ref={nameInputRef} type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleCreate() }}
          placeholder="과정명" maxLength={200} disabled={creating}
          className="flex-1 min-w-[120px] rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-[#333] placeholder:text-gray-300 focus:border-[#1976D2] focus:outline-none" />
        <input type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} disabled={creating}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-[#333] focus:border-[#1976D2] focus:outline-none" />
        <input type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} disabled={creating}
          className={`rounded-lg border px-2 py-1.5 text-xs text-[#333] focus:outline-none ${dateInvalid ? "border-red-400 focus:border-red-500" : "border-gray-200 focus:border-[#1976D2]"}`} />
        <button onClick={handleCreate} disabled={!newName.trim() || !!dateInvalid || creating}
          className="cursor-pointer rounded-lg bg-[#1976D2] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#1565C0] disabled:opacity-40 transition-colors">
          {creating ? "추가 중..." : "추가"}
        </button>
      </div>

      {/* Course card list */}
      {sorted.length === 0 ? (
        <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100 px-5 py-12 text-center text-sm text-gray-400">
          과정이 없습니다
        </div>
      ) : (
        sorted.map(course => {
          const courseScoutings = scoutings.filter(s => s.courseId === course.id)
          const isEditing = editId === course.id
          const hasConfirmed = courseScoutings.some(s => s.status === "confirmed")
          const hasAcceptedOrConfirmed = courseScoutings.some(s => s.status === "accepted" || s.status === "confirmed")
          return (
            <div key={course.id} className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100 px-5 py-3">
              <div className="flex items-center gap-3 cursor-pointer" onClick={() => setEditId(isEditing ? null : course.id)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs text-gray-400 transition-transform ${isEditing ? "rotate-90" : ""}`}>▶</span>
                    <span className="font-semibold text-sm text-[#333] truncate">{course.name}</span>
                    <span className="text-[11px] text-gray-400 shrink-0">{formatPeriod(course.startDate, course.endDate)}</span>
                  </div>
                  {courseScoutings.length > 0 && (
                    <div className="mt-0.5 ml-5 text-[11px] text-gray-400">섭외 {courseScoutings.length}건</div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button onClick={async () => {
                    const msg = hasConfirmed
                      ? "확정된 섭외가 취소됩니다.\n이 과정을 삭제하시겠습니까?"
                      : "연결된 찜꽁이 모두 취소됩니다.\n이 과정을 삭제하시겠습니까?"
                    if (!confirm(msg)) return
                    await onCourseDelete(course.id)
                  }}
                    className="cursor-pointer rounded-lg px-2.5 py-1 text-[11px] text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                    삭제
                  </button>
                </div>
              </div>
              {isEditing && (
                <CourseEditForm
                  course={course}
                  saving={saving}
                  hasAcceptedScoutings={hasAcceptedOrConfirmed}
                  hasConfirmedScoutings={hasConfirmed}
                  onSave={(data) => handleSave(course.id, data)}
                  onCancel={() => setEditId(null)}
                />
              )}
            </div>
          )
        })
      )}

      {/* 삭제된 과정 */}
      {deletedCourses.length > 0 && (
        <div className="rounded-2xl bg-gray-50 border border-gray-200">
          <button
            onClick={() => setShowDeleted(p => !p)}
            className="w-full flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-gray-100 transition-colors"
          >
            <span className={`text-xs text-gray-400 transition-transform ${showDeleted ? "rotate-90" : ""}`}>▶</span>
            <span className="text-xs font-medium text-gray-400">삭제된 과정 ({deletedCourses.length})</span>
          </button>
          {showDeleted && (
            <div className="border-t border-gray-200 px-4 py-2 space-y-1.5">
              {deletedCourses.map(dc => (
                <div key={dc.id} className="flex items-center gap-2 py-1">
                  <span className="text-xs text-gray-400 line-through">{dc.name}</span>
                  {dc.startDate && dc.endDate && (
                    <span className="text-[10px] text-gray-300 line-through">
                      {dc.startDate.slice(0, 10)} ~ {dc.endDate.slice(0, 10)}
                    </span>
                  )}
                  <span className="ml-auto text-[10px] text-gray-300">
                    삭제됨 {dc.deletedAt.slice(0, 10)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
