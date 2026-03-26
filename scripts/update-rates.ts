/**
 * 시급 미입력된 16명 코치에 구글시트 I열 시급 정보 업데이트
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { google } from 'googleapis'
import * as XLSX from 'xlsx'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

const NAMES = [
  '권문진', '김민재', '김수빈', '김승연', '김시은', '김예인',
  '문호연', '박범찬', '박지현', '석은규', '양정무',
]

async function main() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })
  const drive = google.drive({ version: 'v3', auth })
  const res = await drive.files.get(
    { fileId: process.env.GOOGLE_SHEET_ID!, alt: 'media' },
    { responseType: 'arraybuffer' }
  )
  const workbook = XLSX.read(Buffer.from(res.data as ArrayBuffer))
  const sheet = workbook.Sheets['조교실습코치_일반계약요청']
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]

  const rateMap = new Map<string, Set<number>>()
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const name = String(row[4] || '').trim()
    if (!name || !NAMES.includes(name)) continue
    const rateRaw = row[8]
    if (rateRaw) {
      const rate = Number(String(rateRaw).replace(/[,원\s]/g, ''))
      if (!isNaN(rate) && rate > 0) {
        if (!rateMap.has(name)) rateMap.set(name, new Set())
        rateMap.get(name)!.add(rate)
      }
    }
  }

  for (const name of NAMES) {
    const rates = rateMap.get(name)
    if (!rates || rates.size === 0) {
      console.log(`- ${name}: 시급 정보 없음`)
      continue
    }
    const sorted = [...rates].sort((a, b) => a - b)
    const hourlyRate = sorted[sorted.length - 1]
    const rateNote = sorted.length > 1
      ? `시급 이력: ${sorted.map(r => r.toLocaleString()).join('-')}원`
      : undefined

    const coach = await prisma.coach.findFirst({ where: { name } })
    if (!coach) continue

    const updateData: any = { hourlyRate }
    if (rateNote) {
      updateData.selfNote = coach.selfNote
        ? `${coach.selfNote}\n${rateNote}`
        : rateNote
    }

    await prisma.coach.update({ where: { id: coach.id }, data: updateData })
    console.log(`✓ ${name}: ${sorted.map(r => r.toLocaleString()).join('-')}원`)
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
