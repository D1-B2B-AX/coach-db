/**
 * 누락된 2026 코치 16명을 프로덕션 DB에 추가
 * - 노션에 있는 4명: 상세정보 포함
 * - 구글시트에만 있는 12명: 시트에서 파악 가능한 정보만
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { google } from 'googleapis'
import * as XLSX from 'xlsx'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { randomBytes } from 'crypto'
import { normalizeWorkTypeString } from '../src/lib/work-type'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

const NOTION_API_KEY = process.env.NOTION_API_KEY!
const NOTION_DB_ID = process.env.NOTION_DATABASE_ID_2025!
const EXCLUDED_TYPE_TAGS = new Set(['기존', '신규', '취소'])

const MISSING = [
  '권문진', '김민재', '김수빈', '김승연', '김시은', '김예인',
  '문호연', '박범찬', '박지현', '석은규', '양정무', '오찬빈',
  '이승규', '정수진', '정혜승', '조윤주',
]

function generateToken(): string {
  return randomBytes(32).toString('hex')
}

// ── Notion helpers ──

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

function normalizeTypeTags(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter((v) => v && !EXCLUDED_TYPE_TAGS.has(v)))]
}

function sanitizeHistoryNote(raw: string): string {
  if (!raw) return ''
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/삼전\s*전용으로.*$/g, '').trim())
    .filter(Boolean)
    .join('\n')
}

function mapWorkType(types: string[]): string | undefined {
  const normalized = normalizeWorkTypeString(types.join(', '))
  return normalized || undefined
}

const FIELD_MAP: Record<string, string> = {
  '개발/프로그래밍': '웹개발', '데이터 사이언스': '데이터분석',
  '인공지능': 'AI/ML', 'AI/ML': 'AI/ML', '디자인': 'UX/UI',
  '기획/PM': 'PM/PO', '클라우드': '클라우드', '보안': '보안',
  'DevOps': 'DevOps', '모바일': '모바일', '블록체인': '블록체인',
}

async function getNotionCoaches(): Promise<Map<string, any>> {
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

  const map = new Map<string, any>()
  for (const page of allPages) {
    const p = page.properties
    const name = getText(p['이름'])
    if (!name || !MISSING.includes(name)) continue

    const phone = getText(p['연락처'])
    const email = getText(p['이메일'])
    const affiliation = getText(p['소속'])
    const birthDate = getText(p['생년월일'])
    const workTypes = normalizeTypeTags(getMultiSelect(p['근무 유형']))
    const notionFields = getMultiSelect(p['교육 및 가능 분야'])
    const specialties = getMultiSelect(p['전문 분야'])
    const curriculums = getMultiSelect(p['가능 커리큘럼'])
    const noteRaw = getText(p['특이사항 / 히스토리']) || getText(p[' 특이사항 / 히스토리'])
    const note = sanitizeHistoryNote(noteRaw)

    const fields = [...new Set([
      ...notionFields.map(f => FIELD_MAP[f] || f),
      ...specialties.map(f => FIELD_MAP[f] || f),
    ])]

    map.set(name, {
      name, phone, email, affiliation, birthDate,
      workType: workTypes.length ? mapWorkType(workTypes) : undefined,
      fields, curriculums, selfNote: note || undefined,
    })
  }
  return map
}

// ── Google Sheets helpers ──

async function getSheetInfo(): Promise<Map<string, { managers: Set<string>; rates: Set<number> }>> {
  console.log('구글시트에서 추가 정보 추출 중...')
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

  const info = new Map<string, { managers: Set<string>; rates: Set<number> }>()

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const name = String(row[4] || '').trim()
    if (!name || !MISSING.includes(name)) continue

    const manager = String(row[6] || '').trim()
    const rateRaw = row[8] // I열: 시급
    if (!info.has(name)) info.set(name, { managers: new Set(), rates: new Set() })
    if (manager) info.get(name)!.managers.add(manager)
    if (rateRaw) {
      const rate = Number(String(rateRaw).replace(/[,원\s]/g, ''))
      if (!isNaN(rate) && rate > 0) info.get(name)!.rates.add(rate)
    }
  }
  return info
}

// ── Main ──

async function main() {
  const [notionData, sheetData] = await Promise.all([
    getNotionCoaches(),
    getSheetInfo(),
  ])

  console.log(`\n노션에서 찾음: ${notionData.size}명`)
  console.log(`구글시트 정보: ${sheetData.size}명\n`)

  let created = 0

  for (const name of MISSING) {
    // Check if already exists
    const existing = await prisma.coach.findFirst({ where: { name } })
    if (existing) {
      console.log(`⊘ ${name} — 이미 존재`)
      continue
    }

    const notion = notionData.get(name)
    const sheet = sheetData.get(name)

    const coachData: any = {
      name,
      accessToken: generateToken(),
      status: 'active',
    }

    if (notion) {
      // Rich data from Notion
      if (notion.phone) coachData.phone = notion.phone
      if (notion.email) coachData.email = notion.email
      if (notion.affiliation) coachData.affiliation = notion.affiliation
      if (notion.birthDate) {
        const bd = new Date(notion.birthDate)
        if (!isNaN(bd.getTime())) coachData.birthDate = bd
      }
      if (notion.workType) coachData.workType = notion.workType
      if (notion.selfNote) coachData.selfNote = notion.selfNote
    }

    // Set hourly rate from sheet
    if (sheet?.rates?.size) {
      const sorted = [...sheet.rates].sort((a, b) => a - b)
      if (sorted.length === 1) {
        coachData.hourlyRate = sorted[0]
      } else {
        // Multiple rates — store the highest value
        coachData.hourlyRate = sorted[sorted.length - 1]
      }
    }

    // Create coach
    const coach = await prisma.coach.create({ data: coachData })

    // Connect fields (from Notion)
    if (notion?.fields?.length) {
      for (const fieldName of notion.fields) {
        const field = await prisma.field.upsert({
          where: { name: fieldName },
          update: {},
          create: { name: fieldName },
        })
        await prisma.coachField.create({
          data: { coachId: coach.id, fieldId: field.id },
        })
      }
    }

    // Connect curriculums (from Notion)
    if (notion?.curriculums?.length) {
      for (const currName of notion.curriculums) {
        const curr = await prisma.curriculum.upsert({
          where: { name: currName },
          update: {},
          create: { name: currName },
        })
        await prisma.coachCurriculum.create({
          data: { coachId: coach.id, curriculumId: curr.id },
        })
      }
    }

    const source = notion ? '노션' : '구글시트'
    const mgrs = sheet ? [...sheet.managers].join(', ') : ''
    const rateStr = sheet?.rates?.size
      ? `, 시급: ${[...sheet.rates].sort((a, b) => a - b).map(r => r.toLocaleString()).join('-')}원`
      : ''
    console.log(`✓ ${name} (${source}${mgrs ? `, 담당: ${mgrs}` : ''}${rateStr})`)
    created++
  }

  console.log(`\n${created}명 생성 완료`)
  const total = await prisma.coach.count()
  console.log(`전체 코치: ${total}명`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
