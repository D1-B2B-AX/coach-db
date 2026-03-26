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

function parseDate(raw: any): Date | null {
  if (!raw) return null
  const str = String(raw).trim()
  const match = str.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/)
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  if (!isNaN(Number(str))) {
    const serial = Number(str)
    if (serial > 40000 && serial < 50000) {
      return new Date((serial - 25569) * 86400 * 1000)
    }
  }
  return null
}

async function main() {
  const drive = google.drive({ version: 'v3', auth })
  const res = await drive.files.get(
    { fileId: process.env.GOOGLE_SHEET_ID!, alt: 'media' },
    { responseType: 'arraybuffer' }
  )
  const workbook = XLSX.read(Buffer.from(res.data as ArrayBuffer))
  const sheet = workbook.Sheets['조교실습코치_일반계약요청']
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]

  const names2026 = new Set<string>()
  const allNames = new Set<string>()
  let total2026 = 0

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const name = String(row[4] || '').trim()
    const courseName = String(row[7] || '').trim()
    const cancelCol = String(row[0] || '').trim()

    if (!name || !courseName) continue
    if (courseName.includes('취소') || cancelCol.includes('취소')) continue

    allNames.add(name)

    const startDate = parseDate(row[9])
    if (startDate && startDate.getFullYear() === 2026) {
      names2026.add(name)
      total2026++
    }
  }

  console.log(`구글시트 전체 고유 코치: ${allNames.size}명`)
  console.log(`2026년 근무 코치: ${names2026.size}명`)
  console.log(`2026년 투입이력: ${total2026}건`)
  console.log()
  console.log('2026 코치 목록:', [...names2026].join(', '))
}

main().catch(console.error)
