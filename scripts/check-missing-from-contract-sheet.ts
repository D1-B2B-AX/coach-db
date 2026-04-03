import { config } from 'dotenv'
config({ path: '.env.local' })

import { google } from 'googleapis'
import * as XLSX from 'xlsx'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const FILE_ID = '1hl6VxXYN1kJoQlRCpbpyWV2PFsu3LhFQ'
const SHEET_NAME = '조교실습코치_일반계약요청'
const CUTOFF = new Date(Date.UTC(2025, 8, 1, 0, 0, 0)) // 2025-09-01

function parseDate(raw: unknown): Date | null {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null

  const m = s.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/)
  if (m) {
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0))
  }

  const n = Number(s)
  if (!Number.isNaN(n) && n > 40000 && n < 60000) {
    const d = new Date((n - 25569) * 86400 * 1000)
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0))
  }

  return null
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })
  const drive = google.drive({ version: 'v3', auth })

  const file = await drive.files.get({ fileId: FILE_ID, fields: 'id,name,mimeType' })
  const binary = await drive.files.get({ fileId: FILE_ID, alt: 'media' }, { responseType: 'arraybuffer' })

  const workbook = XLSX.read(Buffer.from(binary.data as ArrayBuffer))
  const sheet = workbook.Sheets[SHEET_NAME]
  if (!sheet) throw new Error(`시트를 찾을 수 없습니다: ${SHEET_NAME}`)

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]

  // rows 기준:
  // A(0): 계약서 발송 여부, E(4): 이름, H(7): 과정명, J(9): 고용시작일
  const candidateNames = new Set<string>()
  let totalRows = 0
  let withDateAfterCutoff = 0
  let excludedCancelled = 0

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const cancelCol = String(row[0] || '').trim()
    const name = String(row[4] || '').trim()
    const courseName = String(row[7] || '').trim()
    const startDate = parseDate(row[9])

    if (!name || !courseName || !startDate) continue
    totalRows++
    if (startDate < CUTOFF) continue
    withDateAfterCutoff++

    if (courseName.includes('취소') || cancelCol.includes('취소')) {
      excludedCancelled++
      continue
    }

    candidateNames.add(name)
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  })
  const dbRows = await prisma.coach.findMany({
    where: { deletedAt: null },
    select: { name: true },
  })
  await prisma.$disconnect()

  const dbNames = new Set(dbRows.map((r) => r.name.trim()))
  const missing = [...candidateNames]
    .filter((name) => !dbNames.has(name))
    .sort((a, b) => a.localeCompare(b, 'ko'))

  console.log(JSON.stringify({
    file: file.data.name,
    sheet: SHEET_NAME,
    cutoff: '2025-09-01',
    totalRowsParsed: totalRows,
    rowsAfterCutoff: withDateAfterCutoff,
    rowsCancelledExcluded: excludedCancelled,
    candidatePeopleCount: candidateNames.size,
    missingCount: missing.length,
    missing,
  }, null, 2))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
