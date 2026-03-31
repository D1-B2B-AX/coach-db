/**
 * 프로덕션 DB에 이미 있는 active 코치들의 빈 필드를 노션 25년/26년 DB에서 채움.
 * - workType, birthDate만 대상
 * - 코치 생성/삭제 안 함, pending 제외
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

const NOTION_API_KEY = process.env.NOTION_API_KEY!
const DB_26_ID = process.env.NOTION_DATABASE_ID!
const DB_25_ID = '19e4576d6ffa80a7b08bda382eeb1cd1'

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
  if (prop.type === 'date') return prop.date?.start || ''
  return ''
}

function getMultiSelect(prop: any): string[] {
  if (!prop || prop.type !== 'multi_select') return []
  return prop.multi_select?.map((s: any) => s.name).filter(Boolean) || []
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

function parseBirthDate(raw: string): Date | null {
  const s = raw.trim()
  if (!s) return null
  const m1 = s.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/)
  if (m1) return new Date(Number(m1[1]), Number(m1[2]) - 1, Number(m1[3]))
  const m2 = s.match(/^(\d{2})(\d{2})(\d{2})$/)
  if (m2) {
    const y = Number(m2[1])
    const year = y > 50 ? 1900 + y : 2000 + y
    return new Date(year, Number(m2[2]) - 1, Number(m2[3]))
  }
  return null
}

function mergeWorkTypes(existing: string | null, notion: string | null): string | null {
  const parts = new Set<string>()
  if (existing) existing.split(',').map(s => s.trim()).filter(Boolean).forEach(s => parts.add(s))
  if (notion) notion.split(',').map(s => s.trim()).filter(Boolean).forEach(s => parts.add(s))
  return parts.size > 0 ? [...parts].join(', ') : null
}

async function main() {
  console.log('노션 데이터 조회 중...')
  const [pages26, pages25] = await Promise.all([fetchAll(DB_26_ID), fetchAll(DB_25_ID)])
  console.log(`26년: ${pages26.length}명, 25년: ${pages25.length}명`)

  // Build lookup by name: { workType, birthDate }
  const notionData = new Map<string, { workType: string | null; birthDate: Date | null }>()

  // 25년 먼저 (낮은 우선순위)
  for (const p of pages25) {
    const name = getText(p.properties['이름'])
    if (!name) continue
    const wt = getText(p.properties['유형']) || null
    const bd = parseBirthDate(getText(p.properties['생년월일']))
    notionData.set(name, { workType: wt, birthDate: bd })
  }

  // 26년 덮어쓰기 (높은 우선순위)
  for (const p of pages26) {
    const name = getText(p.properties['이름'])
    if (!name) continue
    const wt26 = getText(p.properties['근무 유형'])
    const wt26type = getMultiSelect(p.properties['유형']).filter(v => v.includes('삼전')).join(', ')
    const wt = mergeWorkTypes(wt26 || null, wt26type || null)
    const bd = parseBirthDate(getText(p.properties['생년월일']))
    const prev = notionData.get(name)
    notionData.set(name, {
      workType: wt || prev?.workType || null,
      birthDate: bd || prev?.birthDate || null,
    })
  }

  // DB에서 active 코치만 가져오기 (pending 제외)
  const coaches = await prisma.coach.findMany({
    where: { status: { not: 'pending' }, deletedAt: null },
    select: { id: true, name: true, workType: true, birthDate: true },
  })
  console.log(`DB active 코치: ${coaches.length}명\n`)

  let updated = 0
  for (const coach of coaches) {
    const notion = notionData.get(coach.name)
    if (!notion) continue

    const updates: Record<string, any> = {}

    // birthDate: DB에 없으면 노션에서 채움
    if (!coach.birthDate && notion.birthDate) {
      updates.birthDate = notion.birthDate
    }

    // workType: 노션 값을 머지 (기존 값 유지 + 노션 값 추가)
    if (notion.workType) {
      const merged = mergeWorkTypes(coach.workType, notion.workType)
      if (merged !== coach.workType) {
        updates.workType = merged
      }
    }

    if (Object.keys(updates).length > 0) {
      await prisma.coach.update({ where: { id: coach.id }, data: updates })
      const parts: string[] = []
      if (updates.birthDate) parts.push(`생년월일: ${updates.birthDate.toISOString().split('T')[0]}`)
      if (updates.workType) parts.push(`유형: ${coach.workType || '-'} → ${updates.workType}`)
      console.log(`✓ ${coach.name}: ${parts.join(', ')}`)
      updated++
    }
  }

  console.log(`\n완료: ${updated}명 업데이트`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
