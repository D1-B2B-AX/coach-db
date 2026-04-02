"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import { isHoliday } from "@/lib/holidays"

interface Scouting {
  id: string
  coachId: string
  courseId: string | null
  date: string
  status: string
  note: string | null
  courseName: string | null
  hireStart: string | null
  hireEnd: string | null
  scheduleText: string | null
  coach: {
    id: string; name: string
    employeeId?: string | null; email?: string | null
    phone?: string | null; workType?: string | null
  }
  manager: { id: string; name: string }
  course?: { id: string; name: string; startDate: string | null; endDate: string | null } | null
}

interface CourseGroup {
  id: string | null // null = 미지정 그룹
  name: string
  startDate: string | null
  endDate: string | null
  createdAt?: string
  dateRows: Map<string, Scouting[]> // date -> scoutings on that date
  allScoutings: Scouting[]
}

const STATUS_CONFIG: Record<string, { label: string; className: string; activeClassName: string }> = {
  all: { label: "전체", className: "bg-gray-100 text-gray-500", activeClassName: "bg-[#333] text-white" },
  scouting: { label: "컨택중", className: "bg-[#FFF3E0] text-[#F57C00]", activeClassName: "bg-[#F57C00] text-white" },
  accepted: { label: "수락", className: "bg-[#E8F5E9] text-[#388E3C]", activeClassName: "bg-[#388E3C] text-white" },
  rejected: { label: "거절", className: "bg-[#FFEBEE] text-[#D32F2F]", activeClassName: "bg-[#D32F2F] text-white" },
  confirmed: { label: "확정", className: "bg-[#E3F2FD] text-[#1976D2]", activeClassName: "bg-[#1976D2] text-white" },
  cancelled: { label: "취소", className: "bg-gray-100 text-gray-400", activeClassName: "bg-gray-500 text-white" },
}

function formatFullDate(d: string): string {
  const date = new Date(d)
  const days = ["일", "월", "화", "수", "목", "금", "토"]
  const yy = String(date.getFullYear()).slice(2)
  return `${yy}.${date.getMonth() + 1}.${date.getDate()}(${days[date.getDay()]})`
}

function parseTimeValue(s: string): string {
  const dot = s.match(/^(\d{1,2})\.(\d+)$/)
  if (dot) {
    const h = dot[1].padStart(2, "0")
    const m = String(Math.round(parseFloat("0." + dot[2]) * 60)).padStart(2, "0")
    return `${h}:${m}`
  }
  const colon = s.match(/^(\d{1,2}):(\d{2})$/)
  if (colon) return `${colon[1].padStart(2, "0")}:${colon[2]}`
  const plain = s.match(/^(\d{1,2})$/)
  if (plain) return `${plain[1].padStart(2, "0")}:00`
  return ""
}

function parseTimeRange(input: string): { start: string; end: string } | null {
  const parts = input.replace(/\s/g, "").split("~")
  if (parts.length !== 2) return null
  const start = parseTimeValue(parts[0])
  const end = parseTimeValue(parts[1])
  if (!start || !end) return null
  return { start, end }
}

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"]

function calcBreakAndTotal(startTime: string, endTime: string): { breakH: number; totalH: number } {
  const [sh, sm] = startTime.split(":").map(Number)
  const [eh, em] = endTime.split(":").map(Number)
  const spanH = (eh * 60 + em - sh * 60 - sm) / 60
  const breakH = spanH >= 8 ? 1 : spanH >= 4 ? 0.5 : 0
  return { breakH, totalH: spanH - breakH }
}

function formatScheduleLine(dateStr: string, startTime: string, endTime: string): string {
  const date = new Date(dateStr + "T12:00:00Z")
  const dayName = DAY_NAMES[date.getUTCDay()]
  const { breakH, totalH } = calcBreakAndTotal(startTime, endTime)
  const breakStr = breakH === 1 ? "1H" : breakH === 0.5 ? "30M" : "0"
  return `${dateStr}(${dayName}) ${startTime} ~ ${endTime} (휴게 ${breakStr}, 총 ${totalH}H)`
}

const SHEET_HEADERS = [
  "계약서 발송 여부", "신규\n조교", "No.", "사번", "근무자 성명",
  "담당직무", "담당Manager", "과정명", "기준시급/월급여",
  "고용시작일", "고용종료일", "퇴사일",
  "소정근로일별 근로시간(휴게시간)\n일 최대 8H, 4시간 근로시 휴게 0.5H 필수",
  "E-mail 주소", "연락처", "연락처 뒷자리 4자리",
  "비고(근무일정 변경시 작성)\n취소사유를 입력부탁드립니다.",
]

export default function MyPage() {
  const [scoutings, setScoutings] = useState<Scouting[]>([])
  const [managerId, setManagerId] = useState<string | null>(null)
  const [managerRole, setManagerRole] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("all")
  const [updating, setUpdating] = useState<string | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)

  // 과정 목록
  const [courses, setCourses] = useState<{ id: string; name: string; startDate: string | null; endDate: string | null; createdAt: string }[]>([])
  const [openAccordions, setOpenAccordions] = useState<Set<string | null>>(new Set())

  // 확정 모달 과정 정보
  const [courseName, setCourseName] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [dateTimes, setDateTimes] = useState<Record<string, string>>({})
  const [allTimeInput, setAllTimeInput] = useState("")
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function fetchMe() {
      try {
        const res = await fetch("/api/auth/me")
        if (res.ok) {
          const data = await res.json()
          setManagerId(data.id)
          setManagerRole(data.role || "")
        } else {
          console.error("[mypage] /api/auth/me failed:", res.status)
        }
      } catch (e) { console.error("[mypage] fetchMe error:", e) }
    }
    fetchMe()
  }, [])

  const fetchScoutings = useCallback(async (silent = false) => {
    if (!managerId) return
    if (!silent) setLoading(true)
    try {
      const res = await fetch(`/api/scoutings?managerId=${managerId}`)
      if (res.ok) {
        const data = await res.json()
        setScoutings(data.scoutings || [])
      }
    } catch { /* ignore */ }
    finally { if (!silent) setLoading(false) }
  }, [managerId])

  const fetchCourses = useCallback(async () => {
    if (!managerId) return
    try {
      const res = await fetch("/api/courses")
      if (res.ok) {
        const data = await res.json()
        const list = (data.courses || []).map((c: { id: string; name: string; startDate: string | null; endDate: string | null; createdAt: string }) => ({
          id: c.id, name: c.name, startDate: c.startDate, endDate: c.endDate, createdAt: c.createdAt,
        }))
        setCourses(list)
        // 초기에 모든 과정 아코디언 열기
        setOpenAccordions(new Set([...list.map((c: { id: string }) => c.id), null]))
      }
    } catch { /* ignore */ }
  }, [managerId])

  useEffect(() => {
    fetchScoutings()
    fetchCourses()
    const interval = setInterval(() => fetchScoutings(true), 30000)
    return () => clearInterval(interval)
  }, [fetchScoutings, fetchCourses])

  const dateChips = useMemo(() => {
    if (!startDate || !endDate) return []
    const dates: { date: string; dayOfMonth: number; isOff: boolean }[] = []
    const cursor = new Date(startDate + "T12:00:00Z")
    const end = new Date(endDate + "T12:00:00Z")
    while (cursor <= end) {
      const dateStr = cursor.toISOString().slice(0, 10)
      const dow = cursor.getUTCDay()
      dates.push({ date: dateStr, dayOfMonth: cursor.getUTCDate(), isOff: dow === 0 || dow === 6 || isHoliday(dateStr) })
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
        const diff = (next.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24)
        if (diff > 1) {
          groups.push(current)
          current = []
        }
      }
    }
    if (current.length > 0) groups.push(current)
    return groups
  }, [dateChips])

  useEffect(() => {
    if (dateChips.length > 0) {
      setSelectedDates(new Set(dateChips.filter(d => !d.isOff).map(d => d.date)))
    } else {
      setSelectedDates(new Set())
    }
  }, [dateChips])

  const defaultTime = useMemo(() => {
    for (const d of dateChips) {
      if (selectedDates.has(d.date) && dateTimes[d.date]?.trim()) return dateTimes[d.date].trim()
    }
    return ""
  }, [dateChips, selectedDates, dateTimes])

  const outputLines = useMemo(() => {
    if (!defaultTime || selectedDates.size === 0) return []
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

  function toggleRow(id: string) {
    setSelectedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllVisible() {
    if (selectedRows.size === filtered.length && filtered.length > 0) {
      setSelectedRows(new Set())
    } else {
      setSelectedRows(new Set(filtered.map(s => s.id)))
    }
  }

  function buildSheetRow(s: Scouting): string[] {
    const c = s.coach
    const isNew = !c.employeeId
    const workType = c.workType === "운영조교" ? "운영조교" : "실습코치"
    return [
      "",                                  // 계약서 발송 여부 (빈칸)
      isNew ? "V" : "",                    // 신규조교 (사번 없으면 체크)
      "",                                  // No. (빈칸)
      c.employeeId || "",                  // 사번
      c.name,                              // 성명
      workType,                            // 담당직무
      s.manager.name,                      // 담당Manager
      s.courseName || "",                  // 과정명 (DB 저장값)
      "15000",                             // 기준시급
      s.hireStart || "",                   // 고용시작일 (DB 저장값)
      s.hireEnd || "",                     // 고용종료일 (DB 저장값)
      "",                                  // 퇴사일 (비워둘것)
      s.scheduleText || "",               // 근로시간 (DB 저장값)
      c.email || "",                       // Email
      c.phone || "",                       // 연락처
      "",                                  // 뒷자리 (비워둘것)
      "",                                  // 비고 (비워둘것)
    ]
  }

  function tsvCell(v: string): string {
    return v.includes("\t") || v.includes("\n") || v.includes('"')
      ? '"' + v.replace(/"/g, '""') + '"' : v
  }

  async function exportRows(mode: "copy" | "excel") {
    const selected = filtered.filter(s => selectedRows.has(s.id))
    console.log("[exportRows]", { mode, selectedLen: selected.length, selectedRowsSize: selectedRows.size, filteredLen: filtered.length })
    if (selected.length === 0) return
    setExporting(true)
    try {
      const rows = selected.map(s => buildSheetRow(s))
      if (mode === "copy") {
        const tsv = rows.map(r => r.map(tsvCell).join("\t")).join("\n")
        await navigator.clipboard.writeText(tsv)
      } else {
        const XLSX = await import("xlsx")
        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.aoa_to_sheet([SHEET_HEADERS, ...rows])
        XLSX.utils.book_append_sheet(wb, ws, "구인이력")
        XLSX.writeFile(wb, "구인이력.xlsx")
      }
    } finally { setExporting(false) }
  }

  async function updateStatus(id: string, status: "confirmed" | "cancelled" | "scouting" | "accepted") {
    setUpdating(id)
    try {
      const body: Record<string, string> = { status }
      if (status === "confirmed") {
        if (courseName) body.courseName = courseName
        if (startDate) body.hireStart = startDate
        if (endDate) body.hireEnd = endDate
        if (outputLines.length > 0) body.scheduleText = outputLines.join("\n")
      }
      const res = await fetch(`/api/scoutings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setScoutings(prev =>
          prev.map(s => s.id === id ? {
            ...s, status,
            ...(status === "confirmed" && {
              courseName: courseName || s.courseName,
              hireStart: startDate || s.hireStart,
              hireEnd: endDate || s.hireEnd,
              scheduleText: outputLines.length > 0 ? outputLines.join("\n") : s.scheduleText,
            }),
          } : s)
        )
        if (status === "confirmed") {
          setConfirmTarget(null)
          const found = scoutings.find(x => x.id === id)
          if (found) {
            const row = buildSheetRow({
              ...found,
              courseName: courseName || found.courseName,
              hireStart: startDate || found.hireStart,
              hireEnd: endDate || found.hireEnd,
              scheduleText: outputLines.length > 0 ? outputLines.join("\n") : found.scheduleText,
            })
            await navigator.clipboard.writeText(row.map(tsvCell).join("\t"))
            setCopiedId(id)
            setTimeout(() => setCopiedId(null), 3000)
          }
        }
      }
    } catch { /* */ }
    finally { setUpdating(null) }
  }

  const counts = useMemo(() => ({
    all: scoutings.length,
    scouting: scoutings.filter(s => s.status === "scouting").length,
    accepted: scoutings.filter(s => s.status === "accepted").length,
    rejected: scoutings.filter(s => s.status === "rejected").length,
    confirmed: scoutings.filter(s => s.status === "confirmed").length,
    cancelled: scoutings.filter(s => s.status === "cancelled").length,
  }), [scoutings])

  const filtered = useMemo(() => {
    if (statusFilter === "all") return scoutings
    return scoutings.filter(s => s.status === statusFilter)
  }, [scoutings, statusFilter])

  // Course-based grouping: course -> date rows -> scoutings
  const courseGroups = useMemo(() => {
    const STATUS_PRIORITY: Record<string, number> = { confirmed: 0, accepted: 1, scouting: 2, rejected: 3, cancelled: 4 }
    const groupMap = new Map<string | null, CourseGroup>()

    // Initialize groups from courses
    for (const c of courses) {
      groupMap.set(c.id, {
        id: c.id, name: c.name, startDate: c.startDate, endDate: c.endDate, createdAt: c.createdAt,
        dateRows: new Map(), allScoutings: [],
      })
    }

    // Place scoutings into groups
    for (const s of filtered) {
      const key = s.courseId
      if (!groupMap.has(key)) {
        if (key === null) {
          groupMap.set(null, { id: null, name: "과정 미지정", startDate: null, endDate: null, dateRows: new Map(), allScoutings: [] })
        } else {
          // courseId exists but course not in our list (unlikely)
          groupMap.set(key, { id: key, name: s.course?.name || "알 수 없는 과정", startDate: s.course?.startDate || null, endDate: s.course?.endDate || null, dateRows: new Map(), allScoutings: [] })
        }
      }
      const group = groupMap.get(key)!
      const dateKey = s.date.slice(0, 10)
      if (!group.dateRows.has(dateKey)) group.dateRows.set(dateKey, [])
      group.dateRows.get(dateKey)!.push(s)
      group.allScoutings.push(s)
    }

    // Sort scoutings within each date row: status priority -> name
    for (const group of groupMap.values()) {
      for (const [, scoutings] of group.dateRows) {
        scoutings.sort((a, b) => {
          const sp = (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9)
          if (sp !== 0) return sp
          return a.coach.name.localeCompare(b.coach.name, "ko")
        })
      }
    }

    // Sort groups: real courses by createdAt desc, null group last
    const result: CourseGroup[] = []
    const realGroups = [...groupMap.values()].filter(g => g.id !== null)
    realGroups.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    result.push(...realGroups)
    const nullGroup = groupMap.get(null)
    if (nullGroup) result.push(nullGroup)

    return result
  }, [filtered, courses])

  const allChecked = filtered.length > 0 && selectedRows.size === filtered.length

  function toggleAccordion(courseId: string | null) {
    setOpenAccordions(prev => {
      const next = new Set(prev)
      if (next.has(courseId)) next.delete(courseId)
      else next.add(courseId)
      return next
    })
  }

  function formatPeriod(start: string | null, end: string | null): string {
    if (!start && !end) return "기간 미정"
    const fmt = (d: string) => { const dt = new Date(d); return `${dt.getMonth() + 1}/${dt.getDate()}` }
    if (start && end) return `${fmt(start)} ~ ${fmt(end)}`
    if (start) return `${fmt(start)} ~`
    return `~ ${fmt(end!)}`
  }

  function getStatusCounts(scoutings: Scouting[]): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const s of scoutings) {
      if (s.status === "cancelled") continue
      counts[s.status] = (counts[s.status] || 0) + 1
    }
    return counts
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">

      <>

      <div className="flex items-center gap-2 mb-4">
        {(["all", "scouting", "accepted", "rejected", "confirmed", "cancelled"] as const).map((key) => {
          const cfg = STATUS_CONFIG[key]
          const active = statusFilter === key
          return (
            <button
              key={key}
              onClick={() => { setStatusFilter(key); setSelectedRows(new Set()) }}
              className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                active ? cfg.activeClassName : cfg.className
              }`}
            >
              {cfg.label} ({counts[key]})
            </button>
          )
        })}
      </div>

      {/* 다중 선택 액션 바 */}
      {selectedRows.size > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[11px] text-gray-500">{selectedRows.size}건 선택</span>
          <button
            onClick={() => exportRows("copy")}
            disabled={exporting}
            className="cursor-pointer rounded-full px-3 py-1 text-[11px] font-medium bg-[#333] text-white hover:bg-[#555] transition-colors disabled:opacity-50"
          >
            복사
          </button>
          <button
            onClick={() => exportRows("excel")}
            disabled={exporting}
            className="cursor-pointer rounded-full px-3 py-1 text-[11px] font-medium bg-[#1B5E20] text-white hover:bg-[#2E7D32] transition-colors disabled:opacity-50"
          >
            엑셀
          </button>
        </div>
      )}

      {/* 전체선택 헤더 */}
      <div className="flex items-center gap-3 mb-2 px-1">
        <input
          type="checkbox"
          checked={allChecked}
          onChange={toggleAllVisible}
          className="w-3.5 h-3.5 accent-[#1976D2] cursor-pointer"
        />
        <span className="text-[11px] text-gray-400">전체 선택</span>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : courseGroups.length === 0 || (courseGroups.every(g => g.allScoutings.length === 0 && g.id !== null) && !courseGroups.some(g => g.id === null && g.allScoutings.length > 0)) ? (
          <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100 px-5 py-16 text-center text-sm text-gray-400">
            {statusFilter === "all" ? "구인 내역이 없습니다" : "해당 상태의 내역이 없습니다"}
          </div>
        ) : (
          courseGroups.map(group => {
            const statusCounts = getStatusCounts(group.allScoutings)
            const sortedDateKeys = [...group.dateRows.keys()].sort()
            const isOpen = openAccordions.has(group.id)

            // 필터가 특정 상태이고 해당 과정에 표시할 scouting이 0건이면 숨김
            if (statusFilter !== "all" && group.allScoutings.length === 0) return null
            // 필터가 전체이고 코치 0명인 실제 과정은 빈 아코디언으로 표시
            // (null 그룹은 코치 없으면 안 보여줌)
            if (group.id === null && group.allScoutings.length === 0) return null

            return (
              <div key={group.id ?? "__null"} className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100 overflow-hidden">
                {/* 아코디언 헤더 */}
                <button
                  onClick={() => toggleAccordion(group.id)}
                  className="w-full flex items-center gap-3 px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <span className={`text-gray-400 text-xs transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
                  <span className="font-semibold text-sm text-[#333]">{group.name}</span>
                  <span className="text-[11px] text-gray-400">{formatPeriod(group.startDate, group.endDate)}</span>
                  <div className="flex items-center gap-1.5 ml-auto">
                    {(["scouting", "accepted", "confirmed", "rejected"] as const).map(st => {
                      const count = statusCounts[st] || 0
                      if (count === 0) return null
                      const cfg = STATUS_CONFIG[st]
                      return (
                        <span key={st} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.className}`}>
                          {cfg.label}({count})
                        </span>
                      )
                    })}
                  </div>
                </button>

                {/* 아코디언 내용 */}
                {isOpen && (
                  <div>
                    {group.allScoutings.length === 0 ? (
                      <div className="px-5 py-8 text-center text-sm text-gray-400">
                        아직 컨택한 코치가 없습니다
                      </div>
                    ) : (
                      sortedDateKeys.map(dateKey => {
                        const scoutingsForDate = group.dateRows.get(dateKey)!
                        return (
                          <div key={dateKey} className="border-t border-gray-100">
                            {/* 날짜 행 */}
                            <div className="px-5 py-2.5 flex items-start gap-3">
                              <span className="text-[11px] font-semibold text-gray-400 whitespace-nowrap shrink-0 pt-0.5 min-w-[72px]">
                                {formatFullDate(dateKey)}
                              </span>
                              {/* 코치 칩들 */}
                              <div className="flex flex-wrap gap-1.5">
                                {scoutingsForDate.map(s => {
                                  const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.scouting
                                  const isUpdating = updating === s.id
                                  const isConfirming = confirmTarget === s.id
                                  return (
                                    <div key={s.id} className="flex flex-col">
                                      <div className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-all ${
                                        selectedRows.has(s.id) ? "border-blue-300 bg-blue-50/50" :
                                        s.status === "cancelled" ? "border-gray-200 bg-gray-50 opacity-50" : "border-gray-200 bg-white hover:bg-gray-50"
                                      }`}>
                                        <input
                                          type="checkbox"
                                          checked={selectedRows.has(s.id)}
                                          onChange={() => toggleRow(s.id)}
                                          className="w-3 h-3 accent-[#1976D2] cursor-pointer"
                                        />
                                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold shrink-0 ${cfg.className}`}>
                                          {cfg.label}
                                        </span>
                                        <Link
                                          href={`/coaches/${s.coachId}`}
                                          className="font-medium text-[#333] hover:text-[#1976D2] transition-colors"
                                        >
                                          {s.coach.name}
                                        </Link>
                                        {copiedId === s.id && (
                                          <span className="text-[10px] text-green-600 font-medium">복사됨!</span>
                                        )}

                                        {/* 액션 버튼들 */}
                                        {s.status === "scouting" && !isConfirming && (
                                          <button onClick={() => updateStatus(s.id, "cancelled")} disabled={isUpdating}
                                            className="cursor-pointer text-[10px] text-gray-400 hover:text-gray-600 disabled:opacity-50">취소</button>
                                        )}
                                        {s.status === "accepted" && !isConfirming && (
                                          <>
                                            <button onClick={() => setConfirmTarget(s.id)} disabled={isUpdating}
                                              className="cursor-pointer text-[10px] text-[#1976D2] font-medium hover:text-[#1565C0] disabled:opacity-50">확정</button>
                                            <button onClick={() => updateStatus(s.id, "cancelled")} disabled={isUpdating}
                                              className="cursor-pointer text-[10px] text-gray-400 hover:text-gray-600 disabled:opacity-50">취소</button>
                                          </>
                                        )}
                                        {s.status === "confirmed" && !isConfirming && (
                                          <>
                                            <button onClick={() => {
                                              setCourseName(s.course?.name || s.courseName || "")
                                              setStartDate(s.course?.startDate ? s.course.startDate.slice(0, 10) : (s.hireStart || ""))
                                              setEndDate(s.course?.endDate ? s.course.endDate.slice(0, 10) : (s.hireEnd || ""))
                                              if (s.scheduleText) {
                                                const lines = s.scheduleText.split("\n")
                                                const times: Record<string, string> = {}
                                                for (const line of lines) {
                                                  const m = line.match(/^(\d{4}-\d{2}-\d{2})\(.+?\)\s+(\d{2}:\d{2})\s*~\s*(\d{2}:\d{2})/)
                                                  if (m) times[m[1]] = `${m[2]}~${m[3]}`
                                                }
                                                setDateTimes(times)
                                                setAllTimeInput(Object.values(times)[0] || "")
                                              } else { setDateTimes({}); setAllTimeInput("") }
                                              setConfirmTarget(s.id)
                                            }} disabled={isUpdating}
                                              className="cursor-pointer text-[10px] text-gray-400 hover:text-gray-600 disabled:opacity-50">수정</button>
                                            <button onClick={() => updateStatus(s.id, "cancelled")} disabled={isUpdating}
                                              className="cursor-pointer text-[10px] text-red-400 hover:text-red-600 disabled:opacity-50">취소</button>
                                          </>
                                        )}
                                        {s.status === "cancelled" && (
                                          <button onClick={() => updateStatus(s.id, "scouting")} disabled={isUpdating}
                                            className="cursor-pointer text-[10px] text-[#F57C00] hover:text-[#E65100] disabled:opacity-50">
                                            {isUpdating ? "..." : "복구"}
                                          </button>
                                        )}
                                      </div>

                                      {/* 확정 모달 (인라인) */}
                                      {isConfirming && (
                                        <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2.5">
                                          <div className="flex items-center gap-2">
                                            <span className="text-[11px] text-gray-400 shrink-0">과정명:</span>
                                            {s.courseId ? (
                                              <span className="text-xs font-medium text-[#333]">{s.course?.name || courseName}</span>
                                            ) : (
                                              <input
                                                type="text"
                                                value={courseName}
                                                onChange={(e) => setCourseName(e.target.value)}
                                                placeholder="선택"
                                                autoFocus={!courseName}
                                                onKeyDown={(e) => { if (e.key === "Escape") setConfirmTarget(null) }}
                                                className="flex-1 min-w-[140px] rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-[#333] placeholder:text-gray-300 focus:border-[#1976D2] focus:outline-none"
                                              />
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span className="text-[11px] text-gray-400 shrink-0">기간:</span>
                                            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                                              className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-[#333] focus:border-[#1976D2] focus:outline-none" />
                                            <span className="text-xs text-gray-400">~</span>
                                            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                                              className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-[#333] focus:border-[#1976D2] focus:outline-none" />
                                          </div>

                                          {weekGroups.length > 0 && (
                                            <>
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="text-[11px] text-gray-400 shrink-0">시간:</span>
                                                <input type="text" value={allTimeInput}
                                                  onChange={(e) => {
                                                    setAllTimeInput(e.target.value)
                                                    const v = e.target.value
                                                    setDateTimes(prev => {
                                                      const next = { ...prev }
                                                      for (const d of dateChips) { if (selectedDates.has(d.date)) next[d.date] = v }
                                                      return next
                                                    })
                                                  }}
                                                  placeholder="9~18"
                                                  className="w-24 rounded-lg border border-gray-200 px-2 py-1 text-[11px] text-[#333] placeholder:text-gray-300 focus:border-[#1976D2] focus:outline-none" />
                                                {[["09:00~18:00", "9-18"], ["08:30~17:30", "8:30-17:30"]].map(([v, label]) => (
                                                  <button key={v} onClick={() => {
                                                    setAllTimeInput(v)
                                                    setDateTimes(prev => {
                                                      const next = { ...prev }
                                                      for (const d of dateChips) { if (selectedDates.has(d.date)) next[d.date] = v }
                                                      return next
                                                    })
                                                  }} className={`cursor-pointer rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${allTimeInput === v ? "bg-[#1976D2] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                                                    {label}
                                                  </button>
                                                ))}
                                              </div>
                                              {weekGroups.map((wg, gi) => (
                                                <div key={gi} className="flex items-center gap-1.5 flex-wrap">
                                                  {wg.map((d) => {
                                                    const sel = selectedDates.has(d.date)
                                                    const dn = DAY_NAMES[new Date(d.date + "T12:00:00Z").getUTCDay()]
                                                    return (
                                                      <div key={d.date} className="flex items-center gap-0.5">
                                                        <button onClick={() => toggleDate(d.date)}
                                                          className={`cursor-pointer rounded-l-lg px-1.5 py-1 text-[11px] font-semibold transition-colors ${sel ? "bg-[#1976D2] text-white" : d.isOff ? "bg-red-50 text-red-300" : "bg-gray-100 text-gray-300"}`}>
                                                          {d.dayOfMonth}({dn})
                                                        </button>
                                                        {sel && (
                                                          <input type="text" value={dateTimes[d.date] || ""}
                                                            onChange={(e) => setDateTimes(prev => ({ ...prev, [d.date]: e.target.value }))}
                                                            placeholder={defaultTime || "09:00~18:00"}
                                                            className="w-24 rounded-r-lg border border-l-0 border-gray-200 px-1.5 py-1 text-[11px] text-[#333] placeholder:text-gray-300 focus:border-[#1976D2] focus:outline-none" />
                                                        )}
                                                      </div>
                                                    )
                                                  })}
                                                </div>
                                              ))}
                                            </>
                                          )}

                                          {outputLines.length > 0 && (
                                            <div className="rounded-lg bg-gray-50 px-3 py-2 space-y-0.5">
                                              {outputLines.map((line) => (
                                                <div key={line} className="text-[11px] text-gray-500 font-mono">{line}</div>
                                              ))}
                                            </div>
                                          )}

                                          <div className="flex items-center gap-2">
                                            <button onClick={() => updateStatus(s.id, "confirmed")} disabled={isUpdating}
                                              className="cursor-pointer rounded-full px-3 py-1.5 text-[11px] font-medium bg-[#1976D2] text-white hover:bg-[#1565C0] transition-colors disabled:opacity-50">
                                              {isUpdating ? "..." : "확정"}
                                            </button>
                                            <button onClick={() => setConfirmTarget(null)}
                                              className="cursor-pointer rounded-full px-2 py-1.5 text-[11px] text-gray-400 hover:text-gray-600">
                                              닫기
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      </>

    </div>
  )
}
