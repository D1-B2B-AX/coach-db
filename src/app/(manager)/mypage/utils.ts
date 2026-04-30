// Types

export interface EngagementHistory {
  id: string
  courseName: string
  status: string
  startDate: string
  endDate: string
  startTime: string | null
  endTime: string | null
  location: string | null
  hourlyRate: number | null
  description: string | null
  remarks: string | null
  rating: number | null
  feedback: string | null
  rehire: boolean | null
  hiredBy: string | null
  coach: {
    id: string
    name: string
    employeeId: string | null
    phone: string | null
    email: string | null
  }
}

export interface EngagementGroup {
  courseName: string
  engagements: EngagementHistory[]
  period: string
}

// 코치+과정명 단위 묶음 (투입 이력 UI에서 한 행으로 합쳐 보여줌)
export interface CoachCourseGroup {
  key: string // coachId + courseName
  coach: EngagementHistory['coach']
  courseName: string
  engagements: EngagementHistory[]
  startDate: string // 가장 이른 시작
  endDate: string   // 가장 늦은 종료
  status: string    // 진행 > 예정 > 완료 > 취소 우선순위
  reviewableId: string | null // 완료 중 가장 이른 engagement (별점 저장 대상)
  location: string | null
  hourlyRate: number | null
  description: string | null
  remarks: string | null
}

const ENGAGEMENT_STATUS_PRIORITY: Record<string, number> = {
  in_progress: 0,
  scheduled: 1,
  completed: 2,
  cancelled: 3,
}

export function groupByCoachCourse(list: EngagementHistory[]): CoachCourseGroup[] {
  const map = new Map<string, EngagementHistory[]>()
  for (const e of list) {
    const key = `${e.coach.id}::${e.courseName}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(e)
  }
  return [...map.entries()].map(([key, engagements]) => {
    const sorted = [...engagements].sort((a, b) => a.startDate.localeCompare(b.startDate))
    const startDate = sorted[0].startDate
    const endDate = sorted.reduce((latest, e) => e.endDate > latest ? e.endDate : latest, sorted[0].endDate)
    const status = sorted.reduce((acc, e) => {
      const p = ENGAGEMENT_STATUS_PRIORITY[e.status] ?? 99
      const accP = ENGAGEMENT_STATUS_PRIORITY[acc] ?? 99
      return p < accP ? e.status : acc
    }, sorted[0].status)
    const firstCompleted = sorted.find(e => e.status === 'completed') || null
    // 공통 필드: 가장 최근 업데이트 가정 — 우선 첫 engagement의 값을 대표값으로 사용
    const rep = sorted[0]
    return {
      key,
      coach: rep.coach,
      courseName: rep.courseName,
      engagements: sorted,
      startDate,
      endDate,
      status,
      reviewableId: firstCompleted?.id || null,
      location: rep.location,
      hourlyRate: rep.hourlyRate,
      description: rep.description,
      remarks: rep.remarks,
    }
  })
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
  remarks: string | null
  createdAt: string
}

export interface DeletedCourse {
  id: string
  name: string
  startDate: string | null
  endDate: string | null
  deletedAt: string
}

// Constants

export const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"]

// Utility functions

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

export function groupEngagements(list: EngagementHistory[]): EngagementGroup[] {
  const map = new Map<string, EngagementHistory[]>()
  for (const e of list) {
    const key = e.courseName
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(e)
  }
  return [...map.entries()].map(([courseName, engagements]) => {
    const sorted = engagements.sort((a, b) => a.startDate.localeCompare(b.startDate))
    const first = sorted[0].startDate.slice(0, 7)
    const last = sorted[sorted.length - 1].endDate.slice(0, 7)
    const period = first === last ? first : `${first} ~ ${last}`
    return { courseName, engagements: sorted, period }
  })
}

export const ENGAGEMENT_STATUS: Record<string, { label: string; className: string }> = {
  scheduled: { label: "예정", className: "text-[#1976D2] bg-[#E3F2FD]" },
  in_progress: { label: "진행", className: "text-[#F57C00] bg-[#FFF3E0]" },
  completed: { label: "완료", className: "text-[#388E3C] bg-[#E8F5E9]" },
  cancelled: { label: "취소", className: "text-gray-400 bg-gray-100" },
}

export function formatPeriod(start: string | null, end: string | null): string {
  if (!start && !end) return "기간 미정"
  const fmt = (d: string) => { const dt = new Date(d); return `${dt.getMonth() + 1}/${dt.getDate()}` }
  if (start && end) return `${fmt(start)} ~ ${fmt(end)}`
  if (start) return `${fmt(start)} ~`
  return `~ ${fmt(end!)}`
}

