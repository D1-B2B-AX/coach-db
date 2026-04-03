/**
 * 누락된 투입이력 127건을 프로덕션 DB에 백필
 * - missing-engagements-report-2026-04-03.json에서 목록 로드
 * - 구글시트에서 근무유형(F열) + 시급(I열) 매칭
 *
 * 실행: npx tsx scripts/backfill-missing-engagements.ts [--dry-run]
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import * as fs from 'fs'
import * as path from 'path'
import { google } from 'googleapis'
import * as XLSX from 'xlsx'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { parseDate } from '../src/lib/sync/engagements'
import { normalizeWorkTypeString } from '../src/lib/work-type'

const DRY_RUN = process.argv.includes('--dry-run')

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

interface SheetExtra {
  workType: string | null
  hourlyRate: number | null
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')

  // 1. Load missing engagements from JSON report
  const reportPath = path.join(__dirname, '..', 'missing-engagements-report-2026-04-03.json')
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'))
  const missing: MissingEntry[] = report.missing
  console.log(`📋 누락 이력: ${missing.length}건`)

  // 2. Download Google Sheet → build lookup map for workType + hourlyRate
  console.log('📥 구글시트 다운로드 중...')
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
    { responseType: 'arraybuffer' },
  )
  const workbook = XLSX.read(Buffer.from(binary.data as ArrayBuffer))
  const sheet = workbook.Sheets[SHEET_NAME]
  if (!sheet) throw new Error(`시트를 찾지 못했습니다: ${SHEET_NAME}`)
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
  console.log(`📊 시트 행: ${rows.length - 1}`)

  // Build lookup: "coachName|courseName|startDate" → { workType, hourlyRate }
  const sheetLookup = new Map<string, SheetExtra>()
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const name = String(row[4] || '').trim()        // E: 근무자 성명
    const workTypeRaw = String(row[5] || '').trim()  // F: 담당직무
    const courseName = String(row[7] || '').trim()   // H: 과정명
    const rateRaw = row[8]                           // I: 시급
    const startDateRaw = row[9]                      // J: 고용시작일

    if (!name || !courseName) continue
    const startDate = parseDate(startDateRaw)
    if (!startDate) continue

    const key = `${name}|${courseName}|${toDateKey(startDate)}`

    // Parse hourly rate
    let hourlyRate: number | null = null
    if (rateRaw) {
      const rate = Number(String(rateRaw).replace(/[,원\s]/g, ''))
      if (!isNaN(rate) && rate > 0 && rate < 1000000) hourlyRate = rate
    }

    const workType = normalizeWorkTypeString(workTypeRaw)

    sheetLookup.set(key, { workType, hourlyRate })
  }
  console.log(`🔍 시트 룩업 키: ${sheetLookup.size}개`)

  // 3. Connect to DB & build coach name → id map
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  })

  const coaches = await prisma.coach.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  })
  const coachByName = new Map(coaches.map((c) => [c.name, c.id]))
  console.log(`👥 DB 코치: ${coaches.length}명`)

  if (DRY_RUN) {
    console.log('\n🏃 DRY-RUN 모드 — DB에 쓰지 않습니다\n')
  }

  // 4. Insert missing engagements (resolve coachId by name from current DB)
  let created = 0
  let skippedDup = 0
  let noSheetMatch = 0
  let noCoachMatch = 0
  const errors: string[] = []

  for (const entry of missing) {
    const { coachName, courseName, startDate, endDate, manager } = entry

    // Resolve coachId from current DB by name
    const coachId = coachByName.get(coachName)
    if (!coachId) {
      noCoachMatch++
      errors.push(`코치 미존재: ${coachName}`)
      continue
    }

    // Look up workType + hourlyRate from sheet
    const lookupKey = `${coachName}|${courseName}|${startDate}`
    const extra = sheetLookup.get(lookupKey)
    if (!extra) {
      noSheetMatch++
      console.log(`  ⚠️  시트 매칭 실패: ${coachName} / ${courseName} / ${startDate}`)
    }

    const workType = extra?.workType || null
    const hourlyRate = extra?.hourlyRate || null

    // Parse dates (UTC noon)
    const start = parseDate(startDate)
    const end = parseDate(endDate)
    if (!start || !end) {
      errors.push(`날짜 파싱 실패: ${coachName} ${courseName} ${startDate}~${endDate}`)
      continue
    }

    // Duplicate check
    const existing = await prisma.engagement.findFirst({
      where: { coachId, courseName, startDate: start },
    })
    if (existing) {
      skippedDup++
      continue
    }

    // Determine status
    const now = new Date()
    let status: 'completed' | 'scheduled' | 'in_progress' = 'completed'
    if (end > now) status = 'scheduled'
    if (start <= now && end >= now) status = 'in_progress'

    if (DRY_RUN) {
      console.log(`  [DRY] ${coachName} | ${courseName} | ${startDate}~${endDate} | ${workType || '-'} | ${hourlyRate || '-'} | ${manager || '-'} | ${status}`)
      created++
      continue
    }

    try {
      await prisma.engagement.create({
        data: {
          coachId,
          courseName,
          startDate: start,
          endDate: end,
          workType,
          hourlyRate,
          hiredBy: manager || null,
          status,
        },
      })
      created++
    } catch (e: any) {
      errors.push(`INSERT 실패: ${coachName} ${courseName} — ${e.message}`)
    }
  }

  // 5. Summary
  console.log('\n═══════════════════════════════════')
  console.log(`✅ 생성: ${created}건`)
  console.log(`⏭️  중복 스킵: ${skippedDup}건`)
  console.log(`⚠️  시트 매칭 실패: ${noSheetMatch}건 (workType/hourlyRate 없이 입력)`)
  if (errors.length > 0) {
    console.log(`❌ 에러: ${errors.length}건`)
    for (const e of errors) console.log(`   ${e}`)
  }

  if (!DRY_RUN) {
    const total = await prisma.engagement.count()
    console.log(`\n📊 전체 투입이력: ${total}건`)
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
