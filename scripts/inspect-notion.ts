/**
 * 노션 DB 구조를 확인하는 스크립트
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

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

function extractValue(prop: any): any {
  switch (prop.type) {
    case 'title': return prop.title?.[0]?.plain_text || ''
    case 'rich_text': return prop.rich_text?.map((t: any) => t.plain_text).join('') || ''
    case 'number': return prop.number
    case 'select': return prop.select?.name || ''
    case 'multi_select': return prop.multi_select?.map((s: any) => s.name) || []
    case 'date': return prop.date?.start || ''
    case 'checkbox': return prop.checkbox
    case 'email': return prop.email || ''
    case 'phone_number': return prop.phone_number || ''
    case 'url': return prop.url || ''
    case 'status': return prop.status?.name || ''
    case 'relation': return `[relation: ${prop.relation?.length || 0}개]`
    case 'rollup': return `[rollup]`
    case 'formula': return prop.formula?.string || prop.formula?.number || ''
    case 'people': return prop.people?.map((p: any) => p.name).join(', ') || ''
    default: return `[${prop.type}]`
  }
}

async function main() {
  // 1. DB 구조
  const db = await fetchNotion(`/databases/${DB_ID}`)
  console.log('=== DB Title ===')
  console.log(db.title?.[0]?.plain_text || 'Untitled')
  console.log('')

  console.log('=== Properties (컬럼) ===')
  for (const [name, prop] of Object.entries(db.properties || {})) {
    console.log(`  ${name} → ${(prop as any).type}`)
  }
  console.log('')

  // 2. 샘플 3개
  const query = await fetchNotion(`/databases/${DB_ID}/query`, { page_size: 3 })
  console.log(`=== Sample Rows (${query.results?.length || 0}개) ===`)
  for (const page of query.results || []) {
    console.log('---')
    for (const [name, prop] of Object.entries(page.properties || {})) {
      const val = extractValue(prop)
      if (val !== null && val !== '' && val !== undefined && JSON.stringify(val) !== '[]' && val !== false) {
        console.log(`  ${name}: ${JSON.stringify(val)}`)
      }
    }
  }

  // 3. 전체 수
  let total = 0
  let cursor: string | undefined
  do {
    const res = await fetchNotion(`/databases/${DB_ID}/query`, {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    })
    total += res.results?.length || 0
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor)
  console.log(`\n=== 전체 ${total}명 ===`)
}

main().catch(console.error)
