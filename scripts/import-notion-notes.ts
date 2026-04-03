/**
 * 노션 2026 DB에서:
 * - "특이사항 / 히스토리" → coaches.selfNote
 * - "근무 가능 기간" + "근무 가능 세부 내용" → coaches.availabilityDetail
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

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
  if (prop.type === 'date') return prop.date?.start || ''
  return ''
}

function sanitizeHistoryNote(raw: string): string {
  if (!raw) return ''
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/삼전\s*전용으로.*$/g, '').trim())
    .filter(Boolean)
    .join('\n')
}

async function main() {
  console.log('노션 2026 DB 조회 중...')
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
  console.log(`${allPages.length}명 조회\n`)

  let updatedHistory = 0
  let updatedAvail = 0

  for (const page of allPages) {
    const p = page.properties
    const name = getText(p['이름'])
    if (!name) continue

    const coach = await prisma.coach.findFirst({ where: { name } })
    if (!coach) continue

    // 특이사항 / 히스토리
    const historyRaw = getText(p[' 특이사항 / 히스토리']) || getText(p['특이사항 / 히스토리'])
    const history = sanitizeHistoryNote(historyRaw)

    // 근무 가능 기간 + 근무 가능 세부 내용
    const period = getText(p['근무 가능 기간'])
    const detail = getText(p['근무 가능 세부 내용'])

    const updates: Record<string, string | null> = {}

    if (history) {
      updates.selfNote = history
    }

    if (period || detail) {
      const parts: string[] = []
      if (period) parts.push(`근무 가능 기간: ${period}`)
      if (detail) parts.push(detail)
      updates.availabilityDetail = parts.join('\n')
    }

    if (Object.keys(updates).length === 0) continue

    await prisma.coach.update({
      where: { id: coach.id },
      data: updates,
    })

    if (updates.selfNote) {
      console.log(`✓ ${name} [히스토리] ${history.slice(0, 50)}${history.length > 50 ? '...' : ''}`)
      updatedHistory++
    }
    if (updates.availabilityDetail) {
      console.log(`✓ ${name} [가용] ${updates.availabilityDetail.slice(0, 50)}${updates.availabilityDetail.length > 50 ? '...' : ''}`)
      updatedAvail++
    }
  }

  console.log(`\n히스토리 ${updatedHistory}명, 가용정보 ${updatedAvail}명 업데이트`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
