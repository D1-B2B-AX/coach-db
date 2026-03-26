import { config } from 'dotenv'
config({ path: '.env.local' })

import { google } from 'googleapis'
import * as XLSX from 'xlsx'

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
})

async function main() {
  const drive = google.drive({ version: 'v3', auth })
  const fileId = process.env.GOOGLE_SHEET_ID!

  // Download as binary (xls/xlsx file, not native Google Sheets)
  console.log('파일 다운로드 중...')
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  )

  const workbook = XLSX.read(Buffer.from(res.data as ArrayBuffer))

  // 1. Sheet names
  console.log('=== 시트 목록 ===')
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
    console.log(`  ${name} (${rows.length - 1}행)`)
  }

  // 2. Find the target sheet (gid=1512869353 → likely "조교실습코치_일반계약요청" or similar)
  // Try each sheet and show headers
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
    if (rows.length < 2) continue

    const headers = rows[0]
    // Check if this sheet has coach-related data
    const hasName = headers.some((h: any) => String(h).includes('성명') || String(h).includes('이름'))
    const hasCourse = headers.some((h: any) => String(h).includes('과정') || String(h).includes('교육'))

    if (hasName || hasCourse) {
      console.log(`\n=== "${name}" ===`)
      console.log('컬럼 목록:')
      headers.forEach((h: any, i: number) => {
        const col = i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26))
        console.log(`  ${col}: ${h}`)
      })

      console.log('\n샘플 데이터 (3행):')
      for (let r = 1; r <= Math.min(3, rows.length - 1); r++) {
        console.log(`--- 행 ${r + 1} ---`)
        rows[r].forEach((val: any, i: number) => {
          if (val !== undefined && val !== null && val !== '') {
            console.log(`  ${headers[i] || `col${i}`}: ${val}`)
          }
        })
      }
      console.log(`\n총 ${rows.length - 1}행`)
    }
  }
}

main().catch(console.error)
