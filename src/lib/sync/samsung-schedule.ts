/**
 * 삼성전자 SW학부 교육과정 스케줄 동기화 모듈
 *
 * 구글시트 "26년 일정" 탭에서 스케줄을 읽어와
 * engagements + engagement_schedules에 저장.
 *
 * 재동기화 시 기존 삼성 engagement/engagement_schedule 삭제 후 재생성.
 */

import { google } from 'googleapis'
import { prisma } from '@/lib/prisma'
import { generateAccessToken } from '@/lib/coach-auth'
import type { SyncResult } from './engagements'
import { mergeWorkTypeStrings } from '@/lib/work-type'

// ─── Constants ───

const SCHEDULE_SHEET_ID = '1GWF3v9lLpS0SlM45QGAHmj2k2N1U2AX8zB8DOMlXHr0'
const SCHEDULE_TAB = '26년 일정'
const CONTRACT_SHEET_ID = '1xFgbLPL1ZLGxQws0ofK0kU8eehrFqEeAiwNbtQ56lyw'
const CONTRACT_TAB = '운영조교/실습코치 계약요청'
const COURSE_NAME = '(B2B) 삼성전자 SW학부 교육과정_26년'
const OLD_COURSE_NAME = '삼성전자 SW학부 교육과정'

interface ContractInfo {
  hourlyRate: number | null
  workType: string | null
  hiredBy: string | null
  employeeId: string | null
  email: string | null
  phone: string | null
}

// ─── Parsing functions (exported for unit testing) ───

/**
 * Parse a date from various formats:
 * - "YYYY-MM-DD", "YYYY.MM.DD", "YYYY/MM/DD"
 * - Excel serial number (40000~60000 range)
 * - Returns null for empty/invalid input
 */
export function parseDate(raw: any): Date | null {
  if (raw == null) return null
  const str = String(raw).trim()
  if (!str) return null

  // "2026-03-04" or "2026.03.04" or "2026/03/04"
  const match = str.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/)
  if (match) {
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0))
  }

  // Excel serial number
  if (!isNaN(Number(str))) {
    const serial = Number(str)
    if (serial > 40000 && serial < 60000) {
      const ms = (serial - 25569) * 86400 * 1000
      const d = new Date(ms)
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0))
    }
  }

  return null
}

/**
 * Expand a start~end date range into an array of individual dates (inclusive).
 * Safety limit of 366 days to prevent infinite loops.
 */
export function expandDateRange(start: Date, end: Date): Date[] {
  const dates: Date[] = []
  const cursor = new Date(start)
  let safety = 0
  while (cursor <= end && safety < 366) {
    dates.push(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), 12, 0, 0)))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    safety++
  }
  return dates
}

// ─── Main sync function ───

interface ScheduleEntry {
  coachId: string
  coachName: string
  startDate: Date
  endDate: Date
}

export async function syncSamsungSchedule(): Promise<SyncResult> {
  const result: SyncResult = {
    totalRows: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    errorDetail: [],
  }
  let coachesCreated = 0

  // Google auth setup
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })

  const sheets = google.sheets({ version: 'v4', auth })

  // 1a. Fetch schedule tab
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SCHEDULE_SHEET_ID,
    range: `'${SCHEDULE_TAB}'!A:J`,
  })
  const rows = res.data.values || []
  result.totalRows = Math.max(0, rows.length - 1)

  // 1b. Fetch contract tab → build lookup by coach name
  const contractByName = new Map<string, ContractInfo>()
  try {
    const contractRes = await sheets.spreadsheets.values.get({
      spreadsheetId: CONTRACT_SHEET_ID,
      range: `'${CONTRACT_TAB}'!A:Q`,
    })
    const contractRows = contractRes.data.values || []
    // 헤더 스킵, 예시행(행1) 스킵
    for (let i = 2; i < contractRows.length; i++) {
      const r = contractRows[i]
      const name = String(r[5] || '').trim()       // F: 근무자 성명
      if (!name) continue

      const eid = String(r[4] || '').trim()         // E: 사번
      const workType = String(r[6] || '').trim()    // G: 담당직무
      const manager = String(r[7] || '').trim()     // H: 담당Manager
      const rateRaw = String(r[9] || '')             // J: 시급
      const emailRaw = String(r[14] || '').trim()   // O: E-mail
      const phoneRaw = String(r[15] || '').trim()   // P: 연락처

      let hourlyRate: number | null = null
      const rate = Number(rateRaw.replace(/[₩,원\s]/g, ''))
      if (!isNaN(rate) && rate > 0 && rate < 1000000) hourlyRate = rate

      const email = emailRaw.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0] || null
      const digits = phoneRaw.replace(/[^\d]/g, '')
      const phone = digits.length >= 10 ? digits.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3') : null

      // 최신 계약 기준으로 덮어쓰기 (같은 코치 복수 행)
      contractByName.set(name, {
        hourlyRate,
        workType: workType || null,
        hiredBy: manager || null,
        employeeId: eid || null,
        email,
        phone,
      })
    }
  } catch (e: any) {
    result.errorDetail.push(`계약 시트 읽기 실패: ${e.message}`)
  }

  // 2. Get all coaches from DB
  const coaches = await prisma.coach.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  })
  const coachByName = new Map<string, string>()
  for (const c of coaches) {
    coachByName.set(c.name, c.id)
  }

  // 3. Parse rows
  // A: 주차, B: 요일, C: 시작일, D: 종료일, E: 과목명, F: 강의장, G: 코치
  const unmatchedNames = new Set<string>()
  const entries: ScheduleEntry[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const startDateRaw = row[2] // C: 시작일
    const endDateRaw = row[3]   // D: 종료일
    const coachRaw = String(row[6] || '').trim() // G: 코치

    if (!coachRaw || !startDateRaw) {
      result.skipped++
      continue
    }

    const startDate = parseDate(startDateRaw)
    const endDate = parseDate(endDateRaw) || startDate

    if (!startDate) {
      result.skipped++
      continue
    }

    // "/" 구분 복수 코치
    const names = coachRaw.split(/[/／]/).map((n: string) => n.trim()).filter(Boolean)

    for (const name of names) {
      const contract = contractByName.get(name)
      let coachId = coachByName.get(name)
      if (!coachId) {
        // DB에 없으면 자동 생성 (계약 시트 정보 활용)
        const created = await prisma.coach.create({
          data: {
            name,
            status: 'active',
            workType: mergeWorkTypeStrings('삼전 DS', contract?.workType),
            accessToken: generateAccessToken(),
            employeeId: contract?.employeeId || null,
            email: contract?.email || null,
            phone: contract?.phone || null,
          },
        })
        coachId = created.id
        coachByName.set(name, coachId)
        coachesCreated++
      } else {
        // 기존 코치: workType + 계약 시트 정보 보완
        const existing = await prisma.coach.findUnique({
          where: { id: coachId },
          select: { workType: true, employeeId: true, email: true, phone: true },
        })
        if (existing) {
          const updates: Record<string, string | null> = {}
          const newType = mergeWorkTypeStrings(existing.workType, '삼전 DS', contract?.workType)
          if (newType !== (existing.workType ?? null)) updates.workType = newType
          if (contract?.employeeId && !existing.employeeId) updates.employeeId = contract.employeeId
          if (contract?.email && !existing.email) updates.email = contract.email
          if (contract?.phone && !existing.phone) updates.phone = contract.phone
          if (Object.keys(updates).length > 0) {
            await prisma.coach.update({ where: { id: coachId }, data: updates })
          }
        }
      }

      entries.push({ coachId, coachName: name, startDate, endDate: endDate! })
      // matched++
    }
  }

  if (unmatchedNames.size > 0) {
    result.errorDetail.push(`미매칭 코치: ${[...unmatchedNames].join(', ')}`)
    result.errors = unmatchedNames.size
  }

  // 4. Re-sync: delete existing Samsung data before inserting

  // Delete existing samsung engagement_schedules (new + old course name)
  const samsungCourseNames = [COURSE_NAME, OLD_COURSE_NAME]
  const deletedEngSchedules = await prisma.engagementSchedule.deleteMany({
    where: { engagement: { courseName: { in: samsungCourseNames } } },
  })

  // Delete existing samsung engagements (new + old course name)
  const deletedEngagements = await prisma.engagement.deleteMany({
    where: { courseName: { in: samsungCourseNames } },
  })

  // 5. Insert into DB
  for (const entry of entries) {
    const contract = contractByName.get(entry.coachName)

    // Engagement (투입 이력)
    const now = new Date()
    let status: 'completed' | 'scheduled' | 'in_progress' = 'completed'
    if (entry.endDate > now) status = 'scheduled'
    if (entry.startDate <= now && entry.endDate >= now) status = 'in_progress'

    const createdEng = await prisma.engagement.create({
      data: {
        coachId: entry.coachId,
        courseName: COURSE_NAME,
        startDate: entry.startDate,
        endDate: entry.endDate,
        startTime: '09:00',
        endTime: '18:00',
        hourlyRate: contract?.hourlyRate || null,
        workType: contract?.workType || '삼전 DS',
        hiredBy: contract?.hiredBy || null,
        status,
      },
    })
    // engagementsCreated++
    result.created++

    // Engagement schedules (개별 날짜)
    const engDates = expandDateRange(entry.startDate, entry.endDate)
    for (const date of engDates) {
      await prisma.engagementSchedule.create({
        data: {
          engagementId: createdEng.id,
          coachId: entry.coachId,
          date,
          startTime: '09:00',
          endTime: '18:00',
        },
      })
    }

  }

  return result
}
