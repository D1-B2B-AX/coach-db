/**
 * 노션 DB → coaches-data.json 변환 스크립트
 * 실행: npx tsx scripts/export-notion-to-json.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import * as fs from 'fs'

const NOTION_API_KEY = process.env.NOTION_API_KEY!
const DB_ID = process.env.NOTION_DATABASE_ID!

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

// 노션 multi_select → Prisma WorkType 매핑
function mapWorkType(types: string[]): string | undefined {
  const t = types[0]?.toLowerCase() || ''
  if (t.includes('코치') || t.includes('프리랜서') || t.includes('freelance')) return 'freelance'
  if (t.includes('조교')) return 'freelance'
  if (t.includes('학생') || t.includes('student')) return 'student'
  if (t.includes('정규') || t.includes('full')) return 'full_time'
  return 'other'
}

// 노션 "교육 및 가능 분야" → 새 DB fields 매핑
function mapFields(notionFields: string[]): string[] {
  const mapping: Record<string, string> = {
    '개발/프로그래밍': '웹개발',
    '데이터 사이언스': '데이터분석',
    '인공지능': 'AI/ML',
    'AI/ML': 'AI/ML',
    '디자인': 'UX/UI',
    '기획/PM': 'PM/PO',
    '클라우드': '클라우드',
    '보안': '보안',
    'DevOps': 'DevOps',
    '모바일': '모바일',
    '블록체인': '블록체인',
  }
  return notionFields.map(f => mapping[f] || f)
}

async function main() {
  console.log('노션 DB에서 코치 데이터 추출 중...')

  // 전체 페이지 가져오기
  const allPages: any[] = []
  let cursor: string | undefined
  do {
    const res = await fetchNotion(`/databases/${DB_ID}/query`, {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    })
    allPages.push(...(res.results || []))
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor)

  console.log(`${allPages.length}명 추출됨`)

  // 변환
  const coaches = allPages.map((page: any) => {
    const p = page.properties

    const name = getText(p['이름'])
    const phone = getText(p['연락처'])
    const email = getText(p['이메일'])
    const affiliation = getText(p['소속'])
    const birthDate = getText(p['생년월일'])
    const portfolioUrl = getText(p['이력서 및 포트폴리오'])
    const note = getText(p[' 특이사항 / 히스토리']) || getText(p['특이사항 / 히스토리'])
    const availabilityDetail = getText(p['근무 가능 세부 내용'])

    const workTypes = getMultiSelect(p['근무 유형'])
    const notionFields = getMultiSelect(p['교육 및 가능 분야'])
    const specialties = getMultiSelect(p['전문 분야'])
    const curriculums = getMultiSelect(p['가능 커리큘럼'])
    const coachType = getMultiSelect(p['유형'])

    // fields = 교육 및 가능 분야 + 전문 분야 (중복 제거)
    const fields = [...new Set([...mapFields(notionFields), ...mapFields(specialties)])]

    const coach: any = { name }
    if (phone) coach.phone = phone
    if (email) coach.email = email
    if (affiliation) coach.affiliation = affiliation
    if (birthDate) coach.birthDate = birthDate
    if (workTypes.length) coach.workType = mapWorkType(workTypes)
    if (fields.length) coach.fields = fields
    if (curriculums.length) coach.curriculums = curriculums
    if (note || availabilityDetail) {
      coach.selfNote = [note, availabilityDetail].filter(Boolean).join('\n')
    }

    return coach
  }).filter((c: any) => c.name) // 이름 없는 항목 제외

  // JSON 저장
  const outPath = 'scripts/coaches-data.json'
  fs.writeFileSync(outPath, JSON.stringify(coaches, null, 2), 'utf-8')
  console.log(`\n${coaches.length}명 데이터 → ${outPath} 저장 완료`)
  console.log('\n다음 단계: npm run migrate:coaches')
}

main().catch(console.error)
