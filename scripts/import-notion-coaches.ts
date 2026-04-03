/**
 * 노션 2026 DB 코치를 DB에 생성/업데이트.
 * - 26년 정보 우선
 * - 2025 DB는 생년월일 보완 용도로만 사용
 * - 이미 DB에 있는 코치는 업데이트, 없으면 생성
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { generateAccessToken } from '../src/lib/coach-auth'
import { normalizeWorkTypeString } from '../src/lib/work-type'

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
  if (prop.type === 'number') return prop.number != null ? String(prop.number) : ''
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

function sanitizeHistoryNote(raw: string): string {
  if (!raw) return ''
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/삼전\s*전용으로.*$/g, '').trim())
    .filter(Boolean)
    .join('\n')
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

// Parse birthDate from text — "YYYY-MM-DD", "YYYY.MM.DD", "YYMMDD", etc.
function parseBirthDate(raw: string): Date | null {
  const s = raw.trim()
  if (!s) return null
  // YYYY-MM-DD or YYYY.MM.DD
  const m1 = s.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/)
  if (m1) return new Date(Number(m1[1]), Number(m1[2]) - 1, Number(m1[3]))
  // YYMMDD
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
  console.log(`26년: ${pages26.length}명${fillBirthdateFrom2025 ? `, 25년(생년월일): ${pages25.length}명` : ''}\n`)

  // Build 25년 lookup (생년월일만, 옵션)
  const birthDate25ByName = new Map<string, Date>()
  if (fillBirthdateFrom2025) {
    for (const p of pages25) {
      const name = getText(p.properties['이름'])
      if (!name) continue
      const birth25 = parseBirthDate(getText(p.properties['생년월일']))
      if (birth25) birthDate25ByName.set(name, birth25)
    }
  }

  let created = 0
  let updated = 0
  let skipped = 0

  for (const page of pages26) {
    const p26 = page.properties
    const name = getText(p26['이름'])
    if (!name) { skipped++; continue }

    // --- Build coach data (기본 2026만, 옵션 시 2025 생년월일만 fallback) ---
    const phone = getText(p26['연락처']) || null
    const email = getText(p26['이메일']) || null
    const birthDate = parseBirthDate(getText(p26['생년월일'])) || birthDate25ByName.get(name) || null
    const affiliation = getText(p26['소속']) || null
    // 유형/근무 유형: 기존/신규/취소만 제외하고 나머지는 전부 반영
    const wt26Values = normalizeTypeTags([
      ...parseTypeTags(p26['근무 유형']),
      ...parseTypeTags(p26['근무유형']),
      ...parseTypeTags(p26['유형']),
    ])
    const workTypeValues = [...new Set(wt26Values)]
    const workType = normalizeWorkTypeString(workTypeValues.join(', '))

    // Fields: 26년 교육 및 가능 분야 + 전문 분야
    const fields26 = [...getMultiSelect(p26['교육 및 가능 분야']), ...getMultiSelect(p26['전문 분야'])]
    const fieldNames = [...new Set(fields26)]

    // Curriculums: 26년만
    const curric26 = getMultiSelect(p26['가능 커리큘럼'])
    const curricNames = [...new Set(curric26)]

    // Portfolio: 26년만
    const portfolio26 = getText(p26['이력서 및 포트폴리오'])
    const portfolioUrl = portfolio26 || null

    // Self note: 26년 특이사항만
    const history26Raw = getText(p26[' 특이사항 / 히스토리']) || getText(p26['특이사항 / 히스토리'])
    const history26 = sanitizeHistoryNote(history26Raw)
    const selfNoteParts: string[] = []
    if (history26) selfNoteParts.push(history26)
    const selfNote = selfNoteParts.join('\n') || null

    // Availability detail: 26년만
    const period26 = getText(p26['근무 가능 기간'])
    const detail26 = getText(p26['근무 가능 세부 내용'])
    const availParts: string[] = []
    if (period26) availParts.push(`근무 가능 기간: ${period26}`)
    if (detail26) availParts.push(detail26)
    const availabilityDetail = availParts.join('\n') || null

    // --- Upsert coach ---
    const existing = await prisma.coach.findFirst({ where: { name } })

    if (existing) {
      await prisma.coach.update({
        where: { id: existing.id },
        data: {
          phone: phone ?? existing.phone,
          email: email ?? existing.email,
          birthDate: birthDate ?? existing.birthDate,
          affiliation: affiliation ?? existing.affiliation,
          workType: workType ?? existing.workType,
          portfolioUrl: portfolioUrl ?? existing.portfolioUrl,
          selfNote: selfNote ?? existing.selfNote,
          availabilityDetail: availabilityDetail ?? existing.availabilityDetail,
        },
      })

      // Update fields & curriculums only if notion has data
      if (fieldNames.length > 0) {
        await prisma.coachField.deleteMany({ where: { coachId: existing.id } })
        for (const fn of fieldNames) {
          const field = await prisma.field.upsert({ where: { name: fn }, create: { name: fn }, update: {} })
          await prisma.coachField.create({ data: { coachId: existing.id, fieldId: field.id } })
        }
      }
      if (curricNames.length > 0) {
        await prisma.coachCurriculum.deleteMany({ where: { coachId: existing.id } })
        for (const cn of curricNames) {
          const curr = await prisma.curriculum.upsert({ where: { name: cn }, create: { name: cn }, update: {} })
          await prisma.coachCurriculum.create({ data: { coachId: existing.id, curriculumId: curr.id } })
        }
      }

      console.log(`↻ ${name} 업데이트`)
      updated++
    } else {
      const coach = await prisma.coach.create({
        data: {
          name,
          phone,
          email,
          birthDate,
          affiliation,
          workType,
          portfolioUrl,
          selfNote,
          availabilityDetail,
          status: 'active',
          accessToken: generateAccessToken(),
        },
      })

      for (const fn of fieldNames) {
        const field = await prisma.field.upsert({ where: { name: fn }, create: { name: fn }, update: {} })
        await prisma.coachField.create({ data: { coachId: coach.id, fieldId: field.id } })
      }
      for (const cn of curricNames) {
        const curr = await prisma.curriculum.upsert({ where: { name: cn }, create: { name: cn }, update: {} })
        await prisma.coachCurriculum.create({ data: { coachId: coach.id, curriculumId: curr.id } })
      }

      console.log(`+ ${name} 생성`)
      created++
    }
  }

  console.log(`\n완료: ${created}명 생성, ${updated}명 업데이트, ${skipped}건 스킵`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
