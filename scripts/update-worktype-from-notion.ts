/**
 * 노션 2025 DB (유형 + 근무유형) + 구글시트 F열(담당직무) → coaches.workType 업데이트
 * multi-select 값을 합쳐서 저장 (쉼표 구분)
 * '기존'은 무시
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

const NOTION_API_KEY = process.env.NOTION_API_KEY!
const NOTION_DB_ID = process.env.NOTION_DATABASE_ID!

async function fetchNotion(endpoint: string, body?: any) {
  const res = await fetch(`https://api.notion.com/v1${endpoint}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Authorization': `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

function getText(prop: any): string {
  if (!prop) return ''
  if (prop.type === 'title') return prop.title?.[0]?.plain_text || ''
  if (prop.type === 'rich_text') return prop.rich_text?.map((t: any) => t.plain_text).join('') || ''
  return ''
}

function getMultiSelect(prop: any): string[] {
  if (!prop || prop.type !== 'multi_select') return []
  return prop.multi_select?.map((s: any) => s.name) || []
}

function getSelect(prop: any): string {
  if (!prop || prop.type !== 'select') return ''
  return prop.select?.name || ''
}

async function getSheetJobTypes(): Promise<Map<string, Set<string>>> {
  console.log('구글시트 F열(담당직무) 조회 중...')
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

  const result = new Map<string, Set<string>>()
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const name = String(row[4] || '').trim() // E: 이름
    const jobType = String(row[5] || '').trim() // F: 담당직무
    if (!name || !jobType) continue
    if (!result.has(name)) result.set(name, new Set())
    result.get(name)!.add(jobType)
  }
  console.log(`시트에서 ${result.size}명의 담당직무 추출\n`)
  return result
}

async function main() {
  // Step 0: Get Google Sheet job types
  const sheetJobTypes = await getSheetJobTypes()

  // Step 1: Fetch all Notion pages
  console.log('노션 2025 DB 조회 중...')
  const allPages: any[] = []
  let cursor: string | undefined
  do {
    const res = await fetchNotion(`/databases/${NOTION_DB_ID}/query`, {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    })
    if (res.results) allPages.push(...res.results)
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor)
  console.log(`노션에서 ${allPages.length}명 조회됨\n`)

  // Step 2: First pass — inspect what property names and values exist
  const propNames = new Set<string>()
  for (const page of allPages) {
    for (const key of Object.keys(page.properties)) {
      propNames.add(key)
    }
  }
  console.log('노션 프로퍼티 목록:', [...propNames].sort().join(', '))
  console.log()

  // Step 3: Build workType per coach name (Notion data)
  const notionTypes = new Map<string, Set<string>>()
  for (const page of allPages) {
    const p = page.properties
    const name = getText(p['이름'])
    if (!name) continue

    const types = new Set<string>()
    for (const fieldName of ['유형', '근무 유형', '근무유형']) {
      const prop = p[fieldName]
      if (!prop) continue
      if (prop.type === 'multi_select') {
        for (const v of getMultiSelect(prop)) types.add(v)
      } else if (prop.type === 'select') {
        const val = getSelect(prop)
        if (val) types.add(val)
      }
    }
    if (types.size > 0) notionTypes.set(name, types)
  }

  // Step 4: Merge Notion + Sheet, update DB
  const allCoaches = await prisma.coach.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, workType: true },
  })

  let updated = 0
  for (const coach of allCoaches) {
    const merged = new Set<string>()

    // Add Notion values
    const notion = notionTypes.get(coach.name)
    if (notion) for (const v of notion) merged.add(v)

    // Add Sheet values
    const sheet = sheetJobTypes.get(coach.name)
    if (sheet) for (const v of sheet) merged.add(v)

    // Filter: remove '기존', empty
    const IGNORE = new Set(['기존', '신규', '취소'])
    const filtered = [...merged].filter(t => !IGNORE.has(t) && t.trim())
    if (filtered.length === 0) continue

    const workType = filtered.join(', ')

    // Only update if changed
    if (coach.workType === workType) continue

    await prisma.coach.update({
      where: { id: coach.id },
      data: { workType },
    })
    console.log(`✓ ${coach.name}: ${workType}`)
    updated++
  }

  console.log(`\n${updated}명 업데이트`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
