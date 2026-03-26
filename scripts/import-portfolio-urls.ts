/**
 * 노션 2026 DB에서 "이력서 및 포트폴리오" URL → coaches.portfolioUrl 업데이트
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
  if (prop.type === 'url') return prop.url || ''
  return ''
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

  let updated = 0
  for (const page of allPages) {
    const p = page.properties
    const name = getText(p['이름'])
    if (!name) continue

    const url = getText(p['이력서 및 포트폴리오'])
    if (!url) continue

    const coach = await prisma.coach.findFirst({ where: { name } })
    if (!coach) continue

    await prisma.coach.update({
      where: { id: coach.id },
      data: { portfolioUrl: url },
    })
    console.log(`✓ ${name}: ${url.slice(0, 60)}${url.length > 60 ? '...' : ''}`)
    updated++
  }

  console.log(`\n${updated}명 포트폴리오 URL 업데이트`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
