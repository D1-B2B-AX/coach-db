/**
 * 프로덕션 DB에 이미 있는 active 코치들의 빈 필드를 노션 25년/26년 DB에서 채움.
 * - workType(2026만), birthDate(2026 우선 + 2025 보완)만 대상
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
const EXCLUDED_TYPE_TAGS = new Set(['기존', '신규', '취소'])

function parseArgs() {
  return {
    fillBirthdateFrom2025: process.argv.includes('--fill-birthdate-from-2025'),
  }
}

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

function splitTags(raw: string): string[] {
  return raw
    .split(/[,/\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseTypeTags(prop: any): string[] {
  if (!prop) return []
  if (prop.type === 'multi_select') return getMultiSelect(prop)
  return splitTags(getText(prop))
}

function normalizeTypeTags(values: string[]): string[] {
  return [...new Set(values.filter((v) => !EXCLUDED_TYPE_TAGS.has(v.trim())))]
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

async function main() {
  const { fillBirthdateFrom2025 } = parseArgs()
  console.log('노션 데이터 조회 중...')
  const pages26 = await fetchAll(DB_26_ID)
  const pages25 = fillBirthdateFrom2025 ? await fetchAll(DB_25_ID) : []
  console.log(`26년: ${pages26.length}명${fillBirthdateFrom2025 ? `, 25년(생년월일): ${pages25.length}명` : ''}`)

  // Build lookup by name: { workType, birthDate }
  const notionData = new Map<string, { workType: string | null; birthDate: Date | null }>()

  // 25년 먼저 (생년월일만, 옵션)
  if (fillBirthdateFrom2025) {
    for (const p of pages25) {
      const name = getText(p.properties['이름'])
      if (!name) continue
      const bd = parseBirthDate(getText(p.properties['생년월일']))
      notionData.set(name, { workType: null, birthDate: bd })
    }
  }

  // 26년 덮어쓰기 (높은 우선순위)
  for (const p of pages26) {
    const name = getText(p.properties['이름'])
    if (!name) continue
    const wtValues = normalizeTypeTags([
      ...parseTypeTags(p.properties['근무 유형']),
      ...parseTypeTags(p.properties['근무유형']),
      ...parseTypeTags(p.properties['유형']),
    ])
    const wt = wtValues.length > 0 ? wtValues.join(', ') : null
    const bd = parseBirthDate(getText(p.properties['생년월일']))
    const prev = notionData.get(name)
    notionData.set(name, {
      workType: wt || null,
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

    // workType: 노션 값을 우선 적용
    if (notion.workType) {
      if (notion.workType !== coach.workType) {
        updates.workType = notion.workType
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
