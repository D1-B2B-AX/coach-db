import { config } from 'dotenv'
config({ path: '.env.local' })

import { google } from 'googleapis'
import * as XLSX from 'xlsx'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { normalizeWorkTypeTokens, WORK_TYPE_ORDER } from '../src/lib/work-type'

const APPLICATION_SHEET_ID = '1xrkRqw3niREpZRIYuB6cEjOGm7Y45bEWkqP02vESR20'
const NOTION_DB_ID = process.env.NOTION_DATABASE_ID!
const NOTION_API_KEY = process.env.NOTION_API_KEY!

const CORE_TYPES = new Set(['운영조교', '실습코치'])

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

type NotionPage = { properties?: Record<string, any> }

function parseArgs() {
  const apply = process.argv.includes('--apply')
  return { apply }
}

function getText(prop: any): string {
  if (!prop) return ''
  if (prop.type === 'title') return prop.title?.map((t: any) => t.plain_text).join('') || ''
  if (prop.type === 'rich_text') return prop.rich_text?.map((t: any) => t.plain_text).join('') || ''
  if (prop.type === 'multi_select') return prop.multi_select?.map((t: any) => t.name).join(', ') || ''
  if (prop.type === 'select') return prop.select?.name || ''
  return ''
}

function getMultiSelect(prop: any): string[] {
  if (!prop || prop.type !== 'multi_select') return []
  return prop.multi_select?.map((s: any) => String(s.name || '').trim()).filter(Boolean) || []
}

function parseTypeTags(prop: any): string[] {
  if (!prop) return []
  if (prop.type === 'multi_select') return getMultiSelect(prop)
  const raw = getText(prop)
  if (!raw) return []
  return raw.split(/[,/\n]/).map((v) => v.trim()).filter(Boolean)
}

function toCoreTypeSignature(types: string[]): string {
  return types
    .filter((t) => CORE_TYPES.has(t))
    .sort((a, b) => a.localeCompare(b, 'ko'))
    .join('|')
}

async function fetchSheetWorkTypes(): Promise<Map<string, string[]>> {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })
  const drive = google.drive({ version: 'v3', auth })

  const res = await drive.files.export(
    {
      fileId: APPLICATION_SHEET_ID,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
    { responseType: 'arraybuffer' }
  )
  const workbook = XLSX.read(Buffer.from(res.data as ArrayBuffer))
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]

  const result = new Map<string, string[]>()
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const name = String(row[2] || '').trim() // 이름
    const workTypeRaw = String(row[7] || '').trim() // 근무유형(6번)
    if (!name || !workTypeRaw) continue
    const normalized = normalizeWorkTypeTokens([workTypeRaw])
    if (normalized.length === 0) continue
    result.set(name, normalized)
  }
  return result
}

async function fetchNotionWorkTypes(): Promise<Map<string, string[]>> {
  const pages: NotionPage[] = []
  let cursor: string | undefined

  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Notion API error (${res.status}): ${text}`)
    }

    const data = await res.json() as {
      results?: NotionPage[]
      has_more?: boolean
      next_cursor?: string | null
    }

    if (data.results) pages.push(...data.results)
    cursor = data.has_more ? data.next_cursor ?? undefined : undefined
  } while (cursor)

  const result = new Map<string, string[]>()
  for (const page of pages) {
    const p = page.properties || {}
    const name = getText(p['이름']).trim()
    if (!name) continue

    const tags = [
      ...parseTypeTags(p['근무 유형']),
      ...parseTypeTags(p['근무유형']),
      ...parseTypeTags(p['유형']),
    ]
    const normalized = normalizeWorkTypeTokens(tags)
    if (normalized.length === 0) continue
    result.set(name, normalized)
  }
  return result
}

async function main() {
  const { apply } = parseArgs()
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
  if (!NOTION_DB_ID || !NOTION_API_KEY) throw new Error('NOTION_DATABASE_ID / NOTION_API_KEY is required')

  const [sheetMap, notionMap] = await Promise.all([
    fetchSheetWorkTypes(),
    fetchNotionWorkTypes(),
  ])

  const all = await prisma.coach.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, workType: true },
  })
  const dbByName = new Map(all.map((c) => [c.name, c]))

  const mismatchNames: string[] = []
  let needsFixCount = 0
  let appliedCount = 0
  const details: Array<{
    name: string
    sheet: string
    notion: string
    dbCore: string
    before: string
    after: string
  }> = []

  for (const [name, sheetTypes] of sheetMap) {
    const notionTypes = notionMap.get(name)
    if (!notionTypes) continue
    const coach = dbByName.get(name)
    if (!coach) continue

    const sheetCore = toCoreTypeSignature(sheetTypes)
    const notionCore = toCoreTypeSignature(notionTypes)
    if (sheetCore === notionCore) continue

    mismatchNames.push(name)
    const existing = normalizeWorkTypeTokens([coach.workType || ''])
    const dbCore = toCoreTypeSignature(existing)
    const needsFix = dbCore !== notionCore
    if (needsFix) needsFixCount++
    const nonCoreExisting = existing.filter((t) => !CORE_TYPES.has(t))
    const notionCoreTypes = notionTypes.filter((t) => CORE_TYPES.has(t))
    const finalSet = new Set([...nonCoreExisting, ...notionCoreTypes])
    const finalWorkType = WORK_TYPE_ORDER.filter((t) => finalSet.has(t)).join(', ')

    details.push({
      name,
      sheet: sheetCore || '-',
      notion: notionCore || '-',
      dbCore: dbCore || '-',
      before: coach.workType || '-',
      after: finalWorkType || '-',
    })

    if (apply && needsFix) {
      await prisma.coach.update({
        where: { id: coach.id },
        data: { workType: finalWorkType || null },
      })
      appliedCount++
    }
  }

  console.log(JSON.stringify({
    comparedFromSheet: sheetMap.size,
    comparedWithNotion: [...sheetMap.keys()].filter((n) => notionMap.has(n)).length,
    mismatchCount: mismatchNames.length,
    needsFixCount,
    appliedCount,
    applied: apply,
    preview: details.slice(0, 40),
  }, null, 2))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
