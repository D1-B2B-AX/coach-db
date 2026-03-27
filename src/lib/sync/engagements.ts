/**
 * 계약/일정 동기화 로직 모듈
 * scripts/import-engagements.ts에서 추출한 재사용 가능한 모듈
 */
import { google } from 'googleapis'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { generateAccessToken } from '@/lib/coach-auth'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WorkSchedule {
  date: Date
  startTime: string // "09:00"
  endTime: string   // "18:00"
}

export interface SyncResult {
  totalRows: number
  created: number
  updated: number
  skipped: number
  errors: number
  errorDetail: string[]
}

// ─── Parsing Functions ───────────────────────────────────────────────────────

/**
 * M열 파싱 -- 다양한 형식 지원:
 * - 단일 날짜: "2023.02.13(월) 09:00~17:00"
 * - 날짜 범위: "2023. 1. 2 ~ 2023. 2. 24 (월~금) 08:00 ~ 17:00"
 * - 같은 달 범위: "2023. 1.9(월)~12(목) 08:00 ~ 11:30"
 * - 복수 시간대: "2023. 1.04 (수) 10:00 - 11:00 , 20:00 - 22:00"
 * - 요일 필터: (월~금), (주말 제외), (월, 화, 수, 금)
 * - 연도 없는 날짜: "8월 22일(목) 07:00 ~ 12:00"
 * - M/D 형식: "11/28,12/5"
 */
export function parseWorkSchedules(raw: any, contextYear?: number): WorkSchedule[] {
  if (!raw) return []
  const str = String(raw).trim()
  if (!str) return []

  const defYear = contextYear || new Date().getFullYear()
  const results: WorkSchedule[] = []
  const lines = str.split('\n')

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    // 시간 패턴(HH:MM)이 없으면 스킵 (ex: "SQL 기초 - 20문항")
    if (!/\d{1,2}:\d{2}/.test(line)) continue

    // 특수: "M월 D일 HH:MM ~ M월 D일 HH:MM" (연속 근무, 두 날짜에 걸침)
    const spanMatch = line.match(
      /(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(?:\([^)]*\))?\s*(\d{1,2}:\d{2})\s*~\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(?:\([^)]*\))?\s*(\d{1,2}:\d{2})/
    )
    if (spanMatch) {
      results.push({
        date: new Date(defYear, +spanMatch[1] - 1, +spanMatch[2]),
        startTime: spanMatch[3].padStart(5, '0'),
        endTime: '23:59',
      })
      results.push({
        date: new Date(defYear, +spanMatch[4] - 1, +spanMatch[5]),
        startTime: '00:00',
        endTime: spanMatch[6].padStart(5, '0'),
      })
      continue
    }

    // 시간대 추출
    const times = extractTimeRanges(line)
    if (times.length === 0) continue

    // 날짜 추출 (시간을 제거한 문자열에서)
    const dates = extractDates(line, defYear)

    for (const d of dates) {
      for (const t of times) {
        results.push({ date: d, startTime: t.start, endTime: t.end })
      }
    }
  }

  return results
}

/** HH:MM ~ HH:MM 또는 HH:MM - HH:MM 패턴 추출 */
export function extractTimeRanges(line: string): { start: string; end: string }[] {
  const results: { start: string; end: string }[] = []
  const regex = /(\d{1,2}:\d{2})\s*[~\-–]\s*(\d{1,2}:\d{2})/g
  let m
  while ((m = regex.exec(line)) !== null) {
    results.push({
      start: m[1].padStart(5, '0'),
      end: m[2].padStart(5, '0'),
    })
  }
  return results
}

/** 날짜 추출 -- 시간 패턴을 제거 후 날짜만 파싱 */
export function extractDates(line: string, defYear: number): Date[] {
  // 시간 패턴 제거 (날짜 범위의 ~ 와 혼동 방지)
  const cleaned = line
    .replace(/\d{1,2}:\d{2}\s*[~\-–]\s*\d{1,2}:\d{2}/g, 'TIME')
    .replace(/\d{1,2}:\d{2}/g, 'TIME')

  // 1) 풀 날짜 범위: YYYY.MM.DD ~ YYYY.MM.DD
  {
    const m = cleaned.match(
      /(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*(?:\([^)]*\))?\s*~\s*(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/
    )
    if (m) {
      const start = new Date(+m[1], +m[2] - 1, +m[3])
      const end = new Date(+m[4], +m[5] - 1, +m[6])
      return expandRange(start, end, extractWeekdays(line))
    }
  }

  // 2) 같은 달 짧은 범위: YYYY.M.D~D (ex: 2023. 1.9(월)~12(목))
  {
    const m = cleaned.match(
      /(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]?\s*(\d{1,2})\s*(?:\([^)]*\))?\s*~\s*(\d{1,2})\s*(?:\([^)]*\))?/
    )
    if (m && +m[4] <= 31) {
      // ~ 뒤가 4자리 연도가 아닌지 확인
      const afterTilde = cleaned.slice(cleaned.indexOf('~') + 1).trim()
      if (!/^\d{4}/.test(afterTilde)) {
        const start = new Date(+m[1], +m[2] - 1, +m[3])
        const end = new Date(+m[1], +m[2] - 1, +m[4])
        return expandRange(start, end, extractWeekdays(line))
      }
    }
  }

  // 3) 연도 있는 단일 날짜 (여러 개 가능)
  {
    const dates: Date[] = []
    const regex = /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]?\s*(\d{1,2})\s*일?\s*(?:\([^)]*\))?/g
    let m
    while ((m = regex.exec(cleaned)) !== null) {
      const y = +m[1], mo = +m[2], d = +m[3]
      if (y >= 2020 && y <= 2030 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        dates.push(new Date(y, mo - 1, d))
      }
    }
    if (dates.length > 0) return dates
  }

  // 4) 연도 없는 날짜: M월 D일
  {
    const dates: Date[] = []
    const regex = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/g
    let m
    while ((m = regex.exec(cleaned)) !== null) {
      dates.push(new Date(defYear, +m[1] - 1, +m[2]))
    }
    if (dates.length > 0) return dates
  }

  // 5) M/D 형식: 11/28, 12/5
  {
    const dates: Date[] = []
    const regex = /(\d{1,2})\/(\d{1,2})/g
    let m
    while ((m = regex.exec(cleaned)) !== null) {
      const mo = +m[1], d = +m[2]
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        dates.push(new Date(defYear, mo - 1, d))
      }
    }
    if (dates.length > 0) return dates
  }

  return []
}

/** 요일 필터 추출: (월~금), (주말 제외), (월, 화, 수, 금) */
export function extractWeekdays(line: string): number[] | null {
  const dayMap: Record<string, number> = {
    '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6,
  }

  if (/주말\s*제외/.test(line)) return [1, 2, 3, 4, 5]

  // (월~금) 범위
  const rangeMatch = line.match(/\(\s*([월화수목금토일])\s*~\s*([월화수목금토일])\s*\)/)
  if (rangeMatch) {
    const s = dayMap[rangeMatch[1]], e = dayMap[rangeMatch[2]]
    if (s !== undefined && e !== undefined && s <= e) {
      const days: number[] = []
      for (let i = s; i <= e; i++) days.push(i)
      return days
    }
  }

  // (월, 화, 수, 금) 리스트
  const listMatch = line.match(
    /\(\s*([월화수목금토일])\s*[,\s]\s*([월화수목금토일])(?:\s*[,\s]\s*([월화수목금토일]))?(?:\s*[,\s]\s*([월화수목금토일]))?(?:\s*[,\s]\s*([월화수목금토일]))?\s*[/\s)]/
  )
  if (listMatch) {
    const days: number[] = []
    for (let i = 1; i <= 5; i++) {
      if (listMatch[i] && dayMap[listMatch[i]] !== undefined) {
        days.push(dayMap[listMatch[i]])
      }
    }
    if (days.length >= 2) return days
  }

  return null
}

/** 날짜 범위 확장 (요일 필터 적용) */
export function expandRange(start: Date, end: Date, weekdays?: number[] | null): Date[] {
  const dates: Date[] = []
  const cursor = new Date(start)
  let safety = 0
  while (cursor <= end && safety < 366) {
    if (!weekdays || weekdays.includes(cursor.getDay())) {
      dates.push(new Date(cursor))
    }
    cursor.setDate(cursor.getDate() + 1)
    safety++
  }
  return dates
}

export function parseDate(raw: any): Date | null {
  if (!raw) return null
  const str = String(raw).trim()

  // "2022.11.14" or "2022-11-14"
  const match = str.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/)
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  }

  // Excel serial number
  if (!isNaN(Number(str))) {
    const serial = Number(str)
    if (serial > 40000 && serial < 50000) {
      const date = new Date((serial - 25569) * 86400 * 1000)
      return date
    }
  }

  return null
}

// ─── Sync Function ───────────────────────────────────────────────────────────

/**
 * 구글시트에서 투입 이력을 읽어와 DB에 동기화
 * scripts/import-engagements.ts의 main() 함수를 모듈화한 버전
 */
export async function syncEngagements(): Promise<SyncResult> {
  const result: SyncResult = {
    totalRows: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    errorDetail: [],
  }

  // Google Auth setup
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })

  const drive = google.drive({ version: 'v3', auth })
  const fileId = process.env.GOOGLE_SHEET_ID!

  // 1. Download file
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  )
  const workbook = XLSX.read(Buffer.from(res.data as ArrayBuffer))
  const sheet = workbook.Sheets['조교실습코치_일반계약요청']
  if (!sheet) {
    result.errors++
    result.errorDetail.push('시트를 찾을 수 없습니다: 조교실습코치_일반계약요청')
    return result
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
  result.totalRows = rows.length - 1

  // 2. Get all coaches from DB
  const coaches = await prisma.coach.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  })
  const coachByName = new Map<string, string>() // name -> id
  for (const c of coaches) {
    coachByName.set(c.name, c.id)
  }

  // 3. Pre-scan: 코치별 사번 수집 (노이즈 제거 후 유니크 값 join)
  const NOISE = ['취소', '입사취소', '입사 취소', '계약취소', '근무취소', '사번없음', '-']
  const employeeIdsByName = new Map<string, Set<string>>()
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const name = String(row[4] || '').trim()
    const eid = String(row[3] || '').trim().replace(/-\d+$/, '')
    if (!name || !eid || NOISE.includes(eid)) continue
    if (!employeeIdsByName.has(name)) employeeIdsByName.set(name, new Set())
    employeeIdsByName.get(name)!.add(eid)
  }
  // name → "91000025, 81000012" (유니크, 정렬)
  const resolvedEmployeeId = new Map<string, string>()
  for (const [name, ids] of employeeIdsByName) {
    resolvedEmployeeId.set(name, [...ids].sort().join(', '))
  }

  // 4. Parse rows and match
  const unmatchedNames = new Set<string>()
  const engagements: {
    coachId: string
    courseName: string
    startDate: Date
    endDate: Date
    startTime: string | null
    endTime: string | null
    hourlyRate: number | null
    workType: string | null
    hiredBy: string | null
    status: 'completed' | 'scheduled' | 'in_progress'
    schedules: WorkSchedule[]
  }[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const name = String(row[4] || '').trim() // E: 근무자 성명
    const workType = String(row[5] || '').trim() // F: 담당직무 (실습코치/운영조교 등)
    const courseName = String(row[7] || '').trim() // H: 과정명
    const rateRaw = row[8] // I: 시급
    const startDateRaw = row[9] // J: 고용시작일
    const endDateRaw = row[10] // K: 고용종료일
    const manager = String(row[6] || '').trim() // G: 담당Manager
    const cancelCol = String(row[0] || '').trim() // A: 계약서 발송 여부
    const workHoursRaw = row[12] // M: 소정근로일별 근로시간
    const emailRaw = String(row[13] || '').trim() // N: E-mail
    const phoneRaw = String(row[14] || '').trim() // O: 연락처

    // Skip empty rows
    if (!name || !courseName) {
      result.skipped++
      continue
    }

    // Skip cancelled rows
    if (courseName.includes('취소') || cancelCol.includes('취소')) {
      result.skipped++
      continue
    }

    // 날짜 파싱 + 2026년 필터 (코치 매칭보다 먼저)
    const startDate = parseDate(startDateRaw)
    const endDate = parseDate(endDateRaw)
    if (!startDate || !endDate) {
      result.skipped++
      continue
    }
    if (startDate.getFullYear() < 2026) {
      result.skipped++
      continue
    }

    // 이메일/연락처 추출
    const email = emailRaw.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0] || null
    // 전화번호: 하이픈/공백/점 등 구분자 모두 제거 후 숫자만 추출, 010 형식으로 정규화
    const digits = phoneRaw.replace(/[^\d]/g, '')
    const phone = digits.length >= 10 ? digits.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3') : null

    let coachId = coachByName.get(name)
    if (!coachId) {
      // 26년 계약자 자동 생성
      const created = await prisma.coach.create({
        data: {
          name,
          status: 'active',
          accessToken: generateAccessToken(),
          email,
          phone,
          workType: workType || null,
          employeeId: resolvedEmployeeId.get(name) || null,
        },
      })
      coachId = created.id
      coachByName.set(name, coachId)
    } else {
      // 기존 코치: 이메일/연락처/근무유형 비어있으면 보완, 사번은 항상 시트 기준으로 갱신
      const resolvedEid = resolvedEmployeeId.get(name) || null
      if (email || phone || workType || resolvedEid) {
        const existing = await prisma.coach.findUnique({ where: { id: coachId }, select: { email: true, phone: true, workType: true, employeeId: true } })
        const updates: Record<string, string> = {}
        if (!existing?.email && email) updates.email = email
        if (!existing?.phone && phone) updates.phone = phone
        if (!existing?.workType && workType) updates.workType = workType
        if (resolvedEid && existing?.employeeId !== resolvedEid) updates.employeeId = resolvedEid
        if (Object.keys(updates).length > 0) {
          await prisma.coach.update({ where: { id: coachId }, data: updates })
        }
      }
    }

    // Determine status based on dates
    const now = new Date()
    let status: 'completed' | 'scheduled' | 'in_progress' = 'completed'
    if (endDate > now) status = 'scheduled'
    if (startDate <= now && endDate >= now) status = 'in_progress'

    // Parse I column for hourly rate
    let hourlyRate: number | null = null
    if (rateRaw) {
      const rate = Number(String(rateRaw).replace(/[,원\s]/g, ''))
      if (!isNaN(rate) && rate > 0 && rate < 1000000) hourlyRate = rate
    }

    // Parse M column for detailed work schedules
    const schedules = parseWorkSchedules(workHoursRaw, startDate.getFullYear())
    const firstSchedule = schedules.length > 0 ? schedules[0] : null

    engagements.push({
      coachId,
      courseName,
      startDate,
      endDate,
      startTime: firstSchedule?.startTime || null,
      endTime: firstSchedule?.endTime || null,
      hourlyRate,
      workType: workType || null,
      hiredBy: manager || null,
      status,
      schedules,
    })
  }

  // Add unmatched names to error detail
  if (unmatchedNames.size > 0) {
    result.errorDetail.push(`미매칭 코치 (${unmatchedNames.size}명): ${[...unmatchedNames].join(', ')}`)
  }

  // 4. Insert into DB (skip duplicates)
  for (const eng of engagements) {
    // Check for duplicate (same coach + course + startDate)
    const existing = await prisma.engagement.findFirst({
      where: {
        coachId: eng.coachId,
        courseName: eng.courseName,
        startDate: eng.startDate,
      },
    })

    if (existing) {
      result.skipped++
    } else {
      const createdEng = await prisma.engagement.create({
        data: {
          coachId: eng.coachId,
          courseName: eng.courseName,
          startDate: eng.startDate,
          endDate: eng.endDate,
          startTime: eng.startTime,
          endTime: eng.endTime,
          hourlyRate: eng.hourlyRate,
          workType: eng.workType,
          hiredBy: eng.hiredBy,
          status: eng.status,
        },
      })
      result.created++

      // Insert into engagement_schedules
      for (const sched of eng.schedules) {
        await prisma.engagementSchedule.create({
          data: {
            engagementId: createdEng.id,
            coachId: eng.coachId,
            date: sched.date,
            startTime: sched.startTime,
            endTime: sched.endTime,
          },
        })
      }
    }

  }

  return result
}
