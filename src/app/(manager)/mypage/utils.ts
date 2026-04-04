// Types

export interface Scouting {
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

export interface CourseGroup {
  id: string | null
  name: string
  startDate: string | null
  endDate: string | null
  createdAt?: string
  dateRows: Map<string, Scouting[]>
  allScoutings: Scouting[]
}

export interface Course {
  id: string
  name: string
  description: string | null
  startDate: string | null
  endDate: string | null
  workHours: string | null
  location: string | null
  hourlyRate: number | null
  createdAt: string
}

// Constants

export const STATUS_CONFIG: Record<string, { label: string; className: string; activeClassName: string }> = {
  all: { label: "전체", className: "bg-gray-100 text-gray-500", activeClassName: "bg-[#333] text-white" },
  scouting: { label: "찜꽁중", className: "bg-[#FFF3E0] text-[#F57C00]", activeClassName: "bg-[#F57C00] text-white" },
  accepted: { label: "수락", className: "bg-[#E8F5E9] text-[#388E3C]", activeClassName: "bg-[#388E3C] text-white" },
  rejected: { label: "거절", className: "bg-[#FFEBEE] text-[#D32F2F]", activeClassName: "bg-[#D32F2F] text-white" },
  confirmed: { label: "확정", className: "bg-[#E3F2FD] text-[#1976D2]", activeClassName: "bg-[#1976D2] text-white" },
  cancelled: { label: "취소", className: "bg-gray-100 text-gray-400", activeClassName: "bg-gray-500 text-white" },
}

export const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"]

export const SHEET_HEADERS = [
  "계약서 발송 여부", "신규\n조교", "No.", "사번", "근무자 성명",
  "담당직무", "담당Manager", "과정명", "기준시급/월급여",
  "고용시작일", "고용종료일", "퇴사일",
  "소정근로일별 근로시간(휴게시간)\n일 최대 8H, 4시간 근로시 휴게 0.5H 필수",
  "E-mail 주소", "연락처", "연락처 뒷자리 4자리",
  "비고(근무일정 변경시 작성)\n취소사유를 입력부탁드립니다.",
]

// Utility functions

export function formatFullDate(d: string): string {
  const date = new Date(d)
  const days = ["일", "월", "화", "수", "목", "금", "토"]
  const yy = String(date.getFullYear()).slice(2)
  return `${yy}.${date.getMonth() + 1}.${date.getDate()}(${days[date.getDay()]})`
}

export function parseTimeValue(s: string): string {
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

export function parseTimeRange(input: string): { start: string; end: string } | null {
  const parts = input.replace(/\s/g, "").split("~")
  if (parts.length !== 2) return null
  const start = parseTimeValue(parts[0])
  const end = parseTimeValue(parts[1])
  if (!start || !end) return null
  return { start, end }
}

export function calcBreakAndTotal(startTime: string, endTime: string): { breakH: number; totalH: number } {
  const [sh, sm] = startTime.split(":").map(Number)
  const [eh, em] = endTime.split(":").map(Number)
  const spanH = (eh * 60 + em - sh * 60 - sm) / 60
  const breakH = spanH >= 8 ? 1 : spanH >= 4 ? 0.5 : 0
  return { breakH, totalH: spanH - breakH }
}

export function formatScheduleLine(dateStr: string, startTime: string, endTime: string): string {
  const date = new Date(dateStr + "T12:00:00Z")
  const dayName = DAY_NAMES[date.getUTCDay()]
  const { breakH, totalH } = calcBreakAndTotal(startTime, endTime)
  const breakStr = breakH === 1 ? "1H" : breakH === 0.5 ? "30M" : "0"
  return `${dateStr}(${dayName}) ${startTime} ~ ${endTime} (휴게 ${breakStr}, 총 ${totalH}H)`
}

export function tsvCell(v: string): string {
  return v.includes("\t") || v.includes("\n") || v.includes('"')
    ? '"' + v.replace(/"/g, '""') + '"' : v
}

export function buildSheetRow(s: Scouting): string[] {
  const c = s.coach
  const isNew = !c.employeeId
  const workType = c.workType === "운영조교" ? "운영조교" : "실습코치"
  return [
    "",
    isNew ? "V" : "",
    "",
    c.employeeId || "",
    c.name,
    workType,
    s.manager.name,
    s.courseName || "",
    "15000",
    s.hireStart || "",
    s.hireEnd || "",
    "",
    s.scheduleText || "",
    c.email || "",
    c.phone || "",
    "",
    "",
  ]
}

const EXCEL_HEADERS = [
  "계약서 발송 여부",
  "신규\n조교",
  "No.",
  "사번",
  "근무자 성명",
  "담당직무",
  "담당Manager",
  "과정명",
  "기준시급/월급여",
  "고용시작일",
  "고용종료일",
  "퇴사일",
  "소정근로일별 근로시간(휴게시간)\n일 최대 8H, 4시간 근로시 휴게 0.5H 필수",
  "E-mail 주소",
  "연락처",
  "연락처 뒷자리 4자리",
  "비고(근무일정 변경시 작성)\n취소사유를 입력부탁드립니다.",
]

export function buildContractRows(scoutings: Scouting[]): string[][] {
  // 같은 코치는 1줄로 합침
  const grouped = new Map<string, Scouting[]>()
  for (const s of scoutings) {
    const key = s.coachId
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(s)
  }

  return [...grouped.values()].map((items) => {
    const first = items[0]
    const c = first.coach
    const isNew = !c.employeeId
    const workType = c.workType === "운영조교" ? "운영조교" : "실습코치"
    const scheduleLines = items
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
      .filter((s) => s.hireStart && s.hireEnd)
      .map((s) => formatScheduleLine(s.date.slice(0, 10), s.hireStart!, s.hireEnd!))
      .join("\n")
    const phone = c.phone || ""
    const last4 = phone.replace(/[^0-9]/g, "").slice(-4)
    const courseStart = first.course?.startDate?.slice(0, 10) || ""
    const courseEnd = first.course?.endDate?.slice(0, 10) || ""
    return [
      "",
      isNew ? "V" : "",
      "",
      c.employeeId || "",
      c.name,
      workType,
      first.manager.name,
      first.courseName || "",
      "15000",
      courseStart,
      courseEnd,
      "",
      scheduleLines,
      c.email || "",
      phone,
      last4,
      "",
    ]
  })
}

export async function appendToContract(scoutings: Scouting[]): Promise<{ success: boolean; updatedRows: number; startRow?: number | null; error?: string }> {
  const rows = buildContractRows(scoutings)
  try {
    const res = await fetch("/api/admin/contract-append", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    })
    if (res.ok) {
      const data = await res.json()
      return { success: true, updatedRows: data.updatedRows, startRow: data.startRow }
    }
    const err = await res.json().catch(() => ({}))
    return { success: false, updatedRows: 0, error: err.error || "시트 추가 실패" }
  } catch {
    return { success: false, updatedRows: 0, error: "네트워크 오류" }
  }
}

export function formatPeriod(start: string | null, end: string | null): string {
  if (!start && !end) return "기간 미정"
  const fmt = (d: string) => { const dt = new Date(d); return `${dt.getMonth() + 1}/${dt.getDate()}` }
  if (start && end) return `${fmt(start)} ~ ${fmt(end)}`
  if (start) return `${fmt(start)} ~`
  return `~ ${fmt(end!)}`
}

export function getStatusCounts(scoutings: Scouting[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const s of scoutings) {
    if (s.status === "cancelled") continue
    counts[s.status] = (counts[s.status] || 0) + 1
  }
  return counts
}
