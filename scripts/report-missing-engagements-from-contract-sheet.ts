import { config } from 'dotenv'
config({ path: '.env.local' })

import { google } from 'googleapis'
import * as XLSX from 'xlsx'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { parseDate } from '../src/lib/sync/engagements'

const FILE_ID = '1hl6VxXYN1kJoQlRCpbpyWV2PFsu3LhFQ'
const SHEET_NAME = '조교실습코치_일반계약요청'

interface MissingEntry {
  coachName: string
  coachId: string
  courseName: string
  startDate: string
  endDate: string
  manager: string | null
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required')
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })
  const drive = google.drive({ version: 'v3', auth })
  const binary = await drive.files.get(
    { fileId: FILE_ID, alt: 'media' },
    { responseType: 'arraybuffer' }
  )
  const workbook = XLSX.read(Buffer.from(binary.data as ArrayBuffer))
  const sheet = workbook.Sheets[SHEET_NAME]
  if (!sheet) throw new Error(`시트를 찾지 못했습니다: ${SHEET_NAME}`)
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  })

  const coaches = await prisma.coach.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  })
  const coachByName = new Map(coaches.map((c) => [c.name, c.id]))
  const coachIds = coaches.map((c) => c.id)

  const engagements = await prisma.engagement.findMany({
    where: { coachId: { in: coachIds } },
    select: { coachId: true, courseName: true, startDate: true },
  })
  const existingSet = new Set(
    engagements.map((e) => `${e.coachId}|${e.courseName}|${toDateKey(e.startDate)}`)
  )

  let parsedRows = 0
  let cancelledRows = 0
  let rowsForDbCoaches = 0
  let duplicateRowsInSheet = 0

  const seenSheetKeys = new Set<string>()
  const missing: MissingEntry[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const cancelCol = String(row[0] || '').trim() // A
    const name = String(row[4] || '').trim() // E
    const manager = String(row[6] || '').trim() || null // G
    const courseName = String(row[7] || '').trim() // H
    const startDate = parseDate(row[9]) // J
    const endDate = parseDate(row[10]) // K

    if (!name || !courseName || !startDate || !endDate) continue
    parsedRows++

    if (courseName.includes('취소') || cancelCol.includes('취소')) {
      cancelledRows++
      continue
    }

    const coachId = coachByName.get(name)
    if (!coachId) continue
    rowsForDbCoaches++

    const startKey = toDateKey(startDate)
    const key = `${coachId}|${courseName}|${startKey}`

    if (seenSheetKeys.has(key)) {
      duplicateRowsInSheet++
      continue
    }
    seenSheetKeys.add(key)

    if (!existingSet.has(key)) {
      missing.push({
        coachName: name,
        coachId,
        courseName,
        startDate: startKey,
        endDate: toDateKey(endDate),
        manager,
      })
    }
  }

  const byCoach = new Map<string, { coachName: string; count: number }>()
  for (const m of missing) {
    const prev = byCoach.get(m.coachId)
    if (prev) prev.count += 1
    else byCoach.set(m.coachId, { coachName: m.coachName, count: 1 })
  }
  const missingByCoach = [...byCoach.values()].sort(
    (a, b) => b.count - a.count || a.coachName.localeCompare(b.coachName, 'ko')
  )

  console.log(
    JSON.stringify(
      {
        fileId: FILE_ID,
        sheet: SHEET_NAME,
        dbCoachCount: coaches.length,
        dbEngagementCount: engagements.length,
        sheetTotalRows: rows.length - 1,
        parsedRows,
        cancelledRows,
        rowsForDbCoaches,
        duplicateRowsInSheet,
        missingUniqueEngagements: missing.length,
        missingCoachCount: missingByCoach.length,
        missingByCoach,
        missing,
      },
      null,
      2
    )
  )

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
