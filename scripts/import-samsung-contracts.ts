/**
 * 삼성 계약 시트에서 투입 이력 + 코치 정보 동기화
 * 시트: 1xFgbLPL1ZLGxQws0ofK0kU8eehrFqEeAiwNbtQ56lyw → "운영조교/실습코치 계약요청"
 *
 * 컬럼 매핑:
 * 0:상신완료 4:사번 5:성명 6:담당직무 7:담당Manager 8:과정명
 * 9:시급 10:시작일 11:종료일 13:근로시간 14:이메일 15:연락처
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { google } from 'googleapis'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { mergeWorkTypeStrings } from '../src/lib/work-type'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

const SHEET_ID = '1xFgbLPL1ZLGxQws0ofK0kU8eehrFqEeAiwNbtQ56lyw'
const SHEET_NAME = '운영조교/실습코치 계약요청'

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
})

function parseDate(raw: string): Date | null {
  if (!raw) return null
  const m = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  const m2 = raw.match(/(\d{4})[.\s]+(\d{1,2})[.\s]+(\d{1,2})/)
  if (m2) return new Date(Date.UTC(+m2[1], +m2[2] - 1, +m2[3]))
  return null
}

interface WorkSchedule {
  date: Date
  startTime: string
  endTime: string
}

function parseWorkSchedules(raw: string, contextYear?: number): WorkSchedule[] {
  if (!raw) return []
  const results: WorkSchedule[] = []
  const lines = raw.split('\n')

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    if (!/\d{1,2}:\d{2}/.test(line)) continue

    // "2026-02-23 (월) 08:00 ~ 17:00 (휴게1H)"
    const m = line.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s*(?:\([^)]*\))?\s*(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})/)
    if (m) {
      results.push({
        date: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])),
        startTime: m[4].padStart(5, '0'),
        endTime: m[5].padStart(5, '0'),
      })
      continue
    }

    // "2022년 11월 14일 20:00 ~ 22:00"
    const m2 = line.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(?:\([^)]*\))?\s*(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})/)
    if (m2) {
      results.push({
        date: new Date(Date.UTC(+m2[1], +m2[2] - 1, +m2[3])),
        startTime: m2[4].padStart(5, '0'),
        endTime: m2[5].padStart(5, '0'),
      })
    }
  }

  return results
}

function parseRate(raw: string): number | null {
  if (!raw) return null
  const cleaned = raw.replace(/[₩,원\s]/g, '')
  const n = Number(cleaned)
  return !isNaN(n) && n > 0 && n < 10000000 ? n : null
}

async function main() {
  const sheets = google.sheets({ version: 'v4', auth })

  console.log('삼성 계약 시트 조회 중...')
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${SHEET_NAME}'!A:Q`,
  })
  const rows = res.data.values || []
  console.log(`${rows.length - 1}행 읽음`)

  const coaches = await prisma.coach.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, employeeId: true, email: true, phone: true, workType: true },
  })
  const coachByName = new Map<string, typeof coaches[0]>()
  for (const c of coaches) coachByName.set(c.name, c)
  console.log(`DB 코치: ${coaches.length}명\n`)

  let created = 0
  let skipped = 0
  let schedulesCreated = 0
  let coachUpdated = 0
  const unmatchedNames = new Set<string>()

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const name = String(row[5] || '').trim()
    const courseName = String(row[8] || '').trim()
    const startDateRaw = String(row[10] || '').trim()
    const endDateRaw = String(row[11] || '').trim()

    if (!name || !courseName || !startDateRaw) { skipped++; continue }

    const coach = coachByName.get(name)
    if (!coach) {
      unmatchedNames.add(name)
      skipped++
      continue
    }

    const employeeId = String(row[4] || '').trim() || null
    const workType = String(row[6] || '').trim() || null
    const manager = String(row[7] || '').trim() || null
    const rateRaw = String(row[9] || '').trim()
    const workHoursRaw = String(row[13] || '').trim()
    const email = String(row[14] || '').trim() || null
    const phone = String(row[15] || '').trim() || null

    const hourlyRate = parseRate(rateRaw)
    const startDate = parseDate(startDateRaw)
    const endDate = parseDate(endDateRaw)
    if (!startDate || !endDate) { skipped++; continue }

    // Update coach info if missing + merge workType
    const updates: Record<string, string> = {}
    if (!coach.employeeId && employeeId) updates.employeeId = employeeId
    if (!coach.email && email) updates.email = email
    if (!coach.phone && phone) updates.phone = phone
    if (workType) {
      const merged = mergeWorkTypeStrings(coach.workType, workType)
      if (merged && merged !== coach.workType) updates.workType = merged
    }
    if (Object.keys(updates).length > 0) {
      await prisma.coach.update({ where: { id: coach.id }, data: updates })
      coachUpdated++
    }

    // Check for duplicate engagement
    const existing = await prisma.engagement.findFirst({
      where: { coachId: coach.id, courseName, startDate },
    })

    if (existing) {
      skipped++
      continue
    }

    const now = new Date()
    let status = 'completed'
    if (endDate > now) status = 'scheduled'
    if (startDate <= now && endDate >= now) status = 'in_progress'

    const schedules = parseWorkSchedules(workHoursRaw, startDate.getFullYear())

    const eng = await prisma.engagement.create({
      data: {
        coachId: coach.id,
        courseName,
        startDate,
        endDate,
        startTime: schedules[0]?.startTime || null,
        endTime: schedules[0]?.endTime || null,
        hourlyRate,
        hiredBy: manager,
        status,
      },
    })
    created++

    // Create engagement schedules + coach schedules
    for (const sched of schedules) {
      await prisma.engagementSchedule.create({
        data: {
          engagementId: eng.id,
          coachId: coach.id,
          date: sched.date,
          startTime: sched.startTime,
          endTime: sched.endTime,
        },
      })

      const existingSched = await prisma.coachSchedule.findFirst({
        where: { coachId: coach.id, date: sched.date, startTime: sched.startTime, endTime: sched.endTime },
      })
      if (!existingSched) {
        await prisma.coachSchedule.create({
          data: { coachId: coach.id, date: sched.date, startTime: sched.startTime, endTime: sched.endTime },
        })
        schedulesCreated++
      }
    }

    console.log(`✓ ${name} | ${courseName} | ${startDateRaw}~${endDateRaw} | ${schedules.length}일`)
  }

  if (unmatchedNames.size > 0) {
    console.log(`\n미매칭 (${unmatchedNames.size}명): ${[...unmatchedNames].join(', ')}`)
  }

  console.log(`\n=== 결과 ===`)
  console.log(`투입 이력 생성: ${created}건, 스킵: ${skipped}건`)
  console.log(`근로 스케줄 생성: ${schedulesCreated}건`)
  console.log(`코치 정보 업데이트: ${coachUpdated}명`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
