/**
 * 노션 2026 DB 코치를 DB에 생성/업데이트.
 * - 26년 정보 우선
 * - 25년에만 있는 정보(포트폴리오, 메모 등) 보완
 * - 이미 DB에 있는 코치는 업데이트, 없으면 생성
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { generateAccessToken } from '../src/lib/coach-auth'

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
  if (prop.type === 'number') return prop.number != null ? String(prop.number) : ''
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

// Parse phone from 25년 "연락처 (번호&메일)" field — mixed format
function parseContact25(raw: string): { phone: string; email: string } {
  const parts = raw.split(/[\n\/,]/).map(s => s.trim()).filter(Boolean)
  let phone = ''
  let email = ''
  for (const p of parts) {
    if (p.includes('@')) email = email || p
    else if (/\d{2,}/.test(p.replace(/-/g, ''))) phone = phone || p
  }
  return { phone, email }
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

// Check if string looks like a URL
function isUrl(s: string): boolean {
  return /^https?:\/\//.test(s.trim())
}

async function main() {
  console.log('노션 데이터 조회 중...')
  const [pages26, pages25] = await Promise.all([fetchAll(DB_26_ID), fetchAll(DB_25_ID)])
  console.log(`26년: ${pages26.length}명, 25년: ${pages25.length}명\n`)

  // Build 25년 lookup
  const map25 = new Map<string, any>()
  for (const p of pages25) {
    const name = getText(p.properties['이름'])
    if (name) map25.set(name, p.properties)
  }

  let created = 0
  let updated = 0
  let skipped = 0

  for (const page of pages26) {
    const p26 = page.properties
    const name = getText(p26['이름'])
    if (!name) { skipped++; continue }

    const p25 = map25.get(name)
    const contact25 = p25 ? parseContact25(getText(p25['연락처 (번호&메일)'])) : { phone: '', email: '' }

    // --- Build coach data (26 priority, 25 fallback) ---
    const phone = getText(p26['연락처']) || contact25.phone || null
    const email = getText(p26['이메일']) || contact25.email || null
    const birthDateRaw = getText(p26['생년월일']) || (p25 ? getText(p25['생년월일']) : '')
    const birthDate = parseBirthDate(birthDateRaw)
    const affiliation = getText(p26['소속']) || (p25 ? getText(p25['소속']) : '') || null
    const workType = getText(p26['근무 유형']) || (p25 ? getText(p25['유형']) : '') || null

    // Fields: 26년 교육 및 가능 분야 + 전문 분야, fallback 25년
    const fields26 = [...getMultiSelect(p26['교육 및 가능 분야']), ...getMultiSelect(p26['전문 분야'])]
    const fields25 = p25 ? getMultiSelect(p25['가능분야']) : []
    const fieldNames = [...new Set(fields26.length > 0 ? fields26 : fields25)]

    // Curriculums
    const curric26 = getMultiSelect(p26['가능 커리큘럼'])
    const curric25 = p25 ? getMultiSelect(p25['가능 커리큘럼']) : []
    const curricNames = [...new Set(curric26.length > 0 ? curric26 : curric25)]

    // Portfolio
    const portfolio26 = getText(p26['이력서 및 포트폴리오'])
    const note25 = p25 ? getText(p25['비고/참고사항']) : ''
    const portfolioUrl = portfolio26 || (isUrl(note25) ? note25.split(',')[0].trim() : '') || null

    // Self note: 26년 특이사항 + 25년 비고 텍스트 메모
    const history26 = getText(p26[' 특이사항 / 히스토리']) || getText(p26['특이사항 / 히스토리'])
    const noteText25 = (note25 && !isUrl(note25)) ? note25 : ''
    const selfNoteParts: string[] = []
    if (history26) selfNoteParts.push(history26)
    if (noteText25) selfNoteParts.push(noteText25)
    const selfNote = selfNoteParts.join('\n') || null

    // Availability detail
    const period26 = getText(p26['근무 가능 기간'])
    const detail26 = getText(p26['근무 가능 세부 내용'])
    const availNote25 = p25 ? getText(p25['가능 여부 특이사항']) : ''
    const availParts: string[] = []
    if (period26) availParts.push(`근무 가능 기간: ${period26}`)
    if (detail26) availParts.push(detail26)
    else if (availNote25 && !period26) availParts.push(availNote25)
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
