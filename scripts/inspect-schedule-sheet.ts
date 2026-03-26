/**
 * 새 구글시트 구조 확인
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { google } from 'googleapis'

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
})

async function main() {
  const sheets = google.sheets({ version: 'v4', auth })
  const spreadsheetId = '1GWF3v9lLpS0SlM45QGAHmj2k2N1U2AX8zB8DOMlXHr0'

  console.log('시트 메타데이터 조회 중...')
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const sheetNames = meta.data.sheets?.map(s => s.properties?.title) || []
  console.log(`시트 목록: ${sheetNames.join(', ')}\n`)

  for (const sheetName of sheetNames) {
    if (!sheetName) continue
    console.log(`=== ${sheetName} ===`)
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!A1:Z20`,
    })
    const rows = res.data.values || []
    if (rows.length > 0) {
      console.log('헤더:', rows[0].map((v: any, i: number) => `${String.fromCharCode(65 + i)}:${v}`).join(' | '))
    }
    for (let i = 1; i < Math.min(8, rows.length); i++) {
      const row = rows[i]
      if (!row || row.every((v: any) => !v)) continue
      console.log(`행${i}:`, row.map((v: any, j: number) => `${String.fromCharCode(65 + j)}=${v}`).join(' | '))
    }
    // Get total rows
    const full = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!A:A`,
    })
    console.log(`총 ${(full.data.values?.length || 1) - 1}개 데이터행\n`)
  }
}

main().catch(console.error)
