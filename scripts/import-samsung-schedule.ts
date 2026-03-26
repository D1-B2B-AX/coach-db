/**
 * 삼성전자 SW학부 교육과정 일정 임포트
 * 시트: 1GWF3v9lLpS0SlM45QGAHmj2k2N1U2AX8zB8DOMlXHr0 → "26년 일정"
 *
 * 특수 규칙:
 * - G열 코치를 슬래시(/)로 분리, 각각 engagement + schedule 생성
 * - C~D 사이 모든 날이 근무일 (startTime/endTime은 09:00~18:00 기본)
 * - 과정명: 무조건 '삼성전자 SW학부 교육과정'
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { google } from 'googleapis'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

const COURSE_NAME = '삼성전자 SW학부 교육과정'
const SHEET_ID = '1GWF3v9lLpS0SlM45QGAHmj2k2N1U2AX8zB8DOMlXHr0'
const SHEET_NAME = '26년 일정'

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
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])
  return null
}

function expandRange(start: Date, end: Date): Date[] {
  const dates: Date[] = []
  const cursor = new Date(start)
  let safety = 0
  while (cursor <= end && safety < 30) {
    dates.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
    safety++
  }
  return dates
}

async function main() {
  const sheets = google.sheets({ version: 'v4', auth })

  console.log('삼성 시트 조회 중...')
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${SHEET_NAME}'!A:J`,
  })
  const rows = res.data.values || []
  console.log(`${rows.length - 1}행 읽음\n`)

  // Get all coaches from DB
  const coaches = await prisma.coach.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  })
  const coachByName = new Map<string, string>()
  for (const c of coaches) coachByName.set(c.name, c.id)
  console.log(`DB 코치: ${coaches.length}명\n`)

  let created = 0
  let schedulesCreated = 0
  let skipped = 0
  let coachesAutoCreated = 0
  const unmatchedNames = new Set<string>()

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const startStr = String(row[2] || '').trim() // C: 시작일
    const endStr = String(row[3] || '').trim() // D: 종료일
    const coachCell = String(row[6] || '').trim() // G: 코치

    if (!startStr || !endStr || !coachCell) { skipped++; continue }
    if (coachCell === '-' || coachCell === '코치') { skipped++; continue }

    const startDate = parseDate(startStr)
    const endDate = parseDate(endStr)
    if (!startDate || !endDate) { skipped++; continue }

    // Split coaches by / or ,
    const coachNames = coachCell.split(/[\/,]/).map(n => n.trim()).filter(Boolean)

    for (const name of coachNames) {
      let coachId = coachByName.get(name)

      if (!coachId) {
        // Auto-create coach
        const { generateAccessToken } = await import('../src/lib/coach-auth')
        const newCoach = await prisma.coach.create({
          data: { name, status: 'active', accessToken: generateAccessToken() },
        })
        coachId = newCoach.id
        coachByName.set(name, coachId)
        coachesAutoCreated++
        console.log(`  코치 자동 생성: ${name}`)
      }

      // Check for duplicate engagement
      const existing = await prisma.engagement.findFirst({
        where: { coachId, courseName: COURSE_NAME, startDate },
      })

      if (!existing) {
        const now = new Date()
        let status = 'completed'
        if (endDate > now) status = 'scheduled'
        if (startDate <= now && endDate >= now) status = 'in_progress'

        await prisma.engagement.create({
          data: {
            coachId,
            courseName: COURSE_NAME,
            startDate,
            endDate,
            startTime: '09:00',
            endTime: '18:00',
            status,
          },
        })
        created++
      }

      // Create individual schedule entries for each day
      const dates = expandRange(startDate, endDate)
      for (const date of dates) {
        const existingSched = await prisma.coachSchedule.findFirst({
          where: { coachId, date, startTime: '09:00', endTime: '18:00' },
        })
        if (!existingSched) {
          await prisma.coachSchedule.create({
            data: { coachId, date, startTime: '09:00', endTime: '18:00' },
          })
          schedulesCreated++
        }
      }
    }
  }

  const totalEng = await prisma.engagement.count({ where: { courseName: COURSE_NAME } })
  const totalSched = await prisma.coachSchedule.count()

  console.log(`\n=== 결과 ===`)
  console.log(`투입 이력 생성: ${created}건, 스킵: ${skipped}건`)
  console.log(`근로 스케줄 생성: ${schedulesCreated}건`)
  console.log(`코치 자동 생성: ${coachesAutoCreated}명`)
  console.log(`삼성 과정 전체: ${totalEng}건, 전체 스케줄: ${totalSched}건`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
