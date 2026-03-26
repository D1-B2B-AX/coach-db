/**
 * 노션 2025 DB에서 누락된 16명 코치 검색
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

const NOTION_API_KEY = process.env.NOTION_API_KEY!
const DB_ID = process.env.NOTION_DATABASE_ID_2025!

const MISSING_COACHES = [
  '권문진', '김민재', '김수빈', '김승연', '김시은', '김예인',
  '문호연', '박범찬', '박지현', '석은규', '양정무', '오찬빈',
  '이승규', '정수진', '정혜승', '조윤주',
]

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

async function main() {
  console.log(`노션 2025 DB (${DB_ID}) 조회 중...`)

  // Fetch all pages
  const allPages: any[] = []
  let cursor: string | undefined
  do {
    const res = await fetchNotion(`/databases/${DB_ID}/query`, {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    })
    if (res.results) allPages.push(...res.results)
    else { console.log('API error:', JSON.stringify(res, null, 2)); return }
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor)

  console.log(`노션에서 총 ${allPages.length}명 조회됨\n`)

  // Search for missing coaches
  const found: string[] = []
  const notFound: string[] = []

  for (const targetName of MISSING_COACHES) {
    const match = allPages.find((page: any) => {
      const p = page.properties
      const name = getText(p['이름'])
      return name === targetName
    })

    if (match) {
      const p = match.properties
      const name = getText(p['이름'])
      const phone = getText(p['연락처'])
      const email = getText(p['이메일'])
      const affiliation = getText(p['소속'])
      const fields = getMultiSelect(p['교육 및 가능 분야'])
      const specialties = getMultiSelect(p['전문 분야'])
      const curriculums = getMultiSelect(p['가능 커리큘럼'])

      console.log(`✓ ${name}`)
      if (phone) console.log(`  연락처: ${phone}`)
      if (email) console.log(`  이메일: ${email}`)
      if (affiliation) console.log(`  소속: ${affiliation}`)
      if (fields.length) console.log(`  분야: ${fields.join(', ')}`)
      if (specialties.length) console.log(`  전문: ${specialties.join(', ')}`)
      if (curriculums.length) console.log(`  커리큘럼: ${curriculums.join(', ')}`)
      console.log()
      found.push(name)
    } else {
      notFound.push(targetName)
    }
  }

  console.log(`\n=== 결과 ===`)
  console.log(`노션에서 찾음: ${found.length}명`)
  console.log(`노션에도 없음: ${notFound.length}명 → ${notFound.join(', ')}`)
}

main().catch(console.error)
