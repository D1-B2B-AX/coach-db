/**
 * 노션 2026 DB와 coach-db의 코치 목록 diff (read-only).
 *
 * Usage:
 *   # Prod 대상
 *   DATABASE_URL="$PRODUCTION_DATABASE_URL" npx tsx scripts/check-notion-new-coaches.ts
 *
 *   # Local 대상
 *   npx tsx scripts/check-notion-new-coaches.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: false })

import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

const NOTION_API_KEY = process.env.NOTION_API_KEY!
const DB_26_ID = process.env.NOTION_DATABASE_ID!

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
  if (prop.type === 'multi_select') return prop.multi_select?.map((s: any) => s.name).join(', ') || ''
  if (prop.type === 'select') return prop.select?.name || ''
  return ''
}

async function fetchAll(dbId: string) {
  const pages: any[] = []
  let cursor: string | undefined
  do {
    const res = await fetchNotion(`/databases/${dbId}/query`, {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    })
    if (res.results) pages.push(...res.results)
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor)
  return pages
}

async function main() {
  const isProd = process.env.DATABASE_URL?.includes('106.241.141.2') ?? false
  console.log(`DB: ${isProd ? 'PROD (Coolify)' : 'LOCAL'}`)
  console.log(`Notion 2026 DB: ${DB_26_ID}\n`)

  console.log('노션 조회 중...')
  const pages = await fetchAll(DB_26_ID)
  console.log(`노션 2026 DB: ${pages.length}명\n`)

  // DB 코치 이름 목록 (소프트 삭제 제외)
  const dbCoaches = await prisma.coach.findMany({
    where: { deletedAt: null },
    select: { name: true },
  })
  const dbNames = new Set(dbCoaches.map((c) => c.name))
  console.log(`coach-db: ${dbCoaches.length}명 (active + inactive, 삭제 제외)\n`)

  // 노션에 있고 DB에 없는 코치 찾기
  const missing: Array<{ name: string; phone: string; email: string; workType: string; affiliation: string }> = []
  const duplicateNames = new Map<string, number>()

  for (const page of pages) {
    const p = page.properties
    const name = getText(p['이름']).trim()
    if (!name) continue

    // 노션 내 중복 체크
    duplicateNames.set(name, (duplicateNames.get(name) ?? 0) + 1)

    if (!dbNames.has(name)) {
      missing.push({
        name,
        phone: getText(p['연락처']),
        email: getText(p['이메일']),
        workType: [
          getText(p['근무 유형']),
          getText(p['근무유형']),
          getText(p['유형']),
        ].filter(Boolean).join(', '),
        affiliation: getText(p['소속']),
      })
    }
  }

  // 중복 이름 경고
  const dupes = [...duplicateNames.entries()].filter(([, count]) => count > 1)
  if (dupes.length > 0) {
    console.log(`⚠️  노션 내 동명이인:`)
    for (const [name, count] of dupes) console.log(`  - ${name}: ${count}건`)
    console.log()
  }

  console.log(`=== 노션에 있고 DB에 없는 코치 (${missing.length}명) ===`)
  if (missing.length === 0) {
    console.log('(없음 — diff 0건)')
  } else {
    for (const c of missing) {
      const parts = [c.name]
      if (c.workType) parts.push(`[${c.workType}]`)
      if (c.affiliation) parts.push(`소속:${c.affiliation}`)
      if (c.phone) parts.push(`📱${c.phone}`)
      if (c.email) parts.push(`✉️${c.email}`)
      console.log(`  + ${parts.join(' ')}`)
    }
  }

  // 반대 방향도 보여주기 (참고용)
  const notionNames = new Set(pages.map((p: any) => getText(p.properties['이름']).trim()).filter(Boolean))
  const dbOnly = dbCoaches.map((c) => c.name).filter((n) => !notionNames.has(n))
  console.log(`\n=== DB에 있고 노션에 없는 코치 (${dbOnly.length}명, 참고용) ===`)
  if (dbOnly.length === 0) {
    console.log('(없음)')
  } else {
    console.log(`  (처음 10명만 표시)`)
    for (const name of dbOnly.slice(0, 10)) console.log(`  - ${name}`)
    if (dbOnly.length > 10) console.log(`  ... 외 ${dbOnly.length - 10}명`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
