import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

async function main() {
  // 1. Fetch all unique courseNames from Engagement
  const engagements = await prisma.engagement.findMany({
    select: { courseName: true },
    distinct: ['courseName'],
  })

  const courseNames = engagements
    .map(e => e.courseName)
    .filter((name): name is string => name !== null && name.trim() !== '')

  if (courseNames.length === 0) {
    console.log('[경고] courseName이 모두 null입니다. 매핑 0건.')
    process.exit(0)
  }

  // 2. Extract company patterns from courseNames
  // Common patterns: company name appears at start of courseName
  // e.g., "삼성전자 DX부문 신입사원", "LG전자 가전 CS교육"
  const companyFrequency = new Map<string, number>()

  // Extract potential company names (Korean company patterns)
  for (const name of courseNames) {
    // Try to extract company name from beginning of course name
    // Pattern: First word that looks like a company name (ends with 전자, 물산, 화재, etc.)
    const match = name.match(/^([\w가-힣]+(?:전자|물산|화재|생명|증권|건설|화학|에너지|SDI|SDS|디스플레이|바이오|엔지니어링|카드|캐피탈))\s/)
    if (match) {
      const company = match[1]
      companyFrequency.set(company, (companyFrequency.get(company) || 0) + 1)
    }
  }

  // Also check for common prefixes that appear multiple times
  const prefixFreq = new Map<string, number>()
  for (const name of courseNames) {
    // Strip leading tags like [부가세별도], (B2B) before extracting prefix
    const cleaned = name.replace(/^[\[(].*?[\])]\s*/g, '').trim()
    if (!cleaned) continue
    const firstWord = cleaned.split(/[\s_]/)[0]
    if (firstWord && firstWord.length >= 2) {
      prefixFreq.set(firstWord, (prefixFreq.get(firstWord) || 0) + 1)
    }
  }

  // Companies that appear 2+ times as prefix are likely real companies
  for (const [prefix, count] of prefixFreq) {
    // Skip tags/markers that aren't company names
    if (/^[\[(]/.test(prefix)) continue
    if (count >= 2 && !companyFrequency.has(prefix)) {
      companyFrequency.set(prefix, count)
    }
  }

  // 3. Generate alias: first character + "사"
  // For English/mixed names: first letter uppercase + "사"
  const aliasMap = new Map<string, string>()
  for (const [company] of companyFrequency) {
    // Skip anything that looks like a tag, not a company
    if (/^[\[(]/.test(company)) continue
    const firstChar = company.charAt(0).toUpperCase()
    aliasMap.set(company, `${firstChar}사`)
  }

  // 4. Upsert into CompanyAlias
  let mapped = 0
  for (const [companyName, alias] of aliasMap) {
    await prisma.companyAlias.upsert({
      where: { companyName },
      create: { companyName, alias },
      update: { alias },
    })
    mapped++
  }

  // Count unmapped courseNames
  const unmapped = courseNames.filter(name => {
    for (const company of aliasMap.keys()) {
      if (name.startsWith(company) || name.includes(company + ' ')) {
        return false
      }
    }
    return true
  }).length

  console.log(`매핑 완료 ${mapped}건, 미매핑 ${unmapped}건`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
