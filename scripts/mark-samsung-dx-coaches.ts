/**
 * 지정된 22명 코치의 workType에 "삼전 DX"를 병합한다.
 *
 * Usage:
 *   # Dry-run (prod)
 *   DATABASE_URL="$PRODUCTION_DATABASE_URL" npx tsx scripts/mark-samsung-dx-coaches.ts
 *
 *   # Apply (prod)
 *   DATABASE_URL="$PRODUCTION_DATABASE_URL" npx tsx scripts/mark-samsung-dx-coaches.ts --apply
 *
 *   # Dry-run (local)
 *   npx tsx scripts/mark-samsung-dx-coaches.ts
 *
 *   # Apply (local)
 *   npx tsx scripts/mark-samsung-dx-coaches.ts --apply
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: false })

import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { mergeWorkTypeStrings } from '../src/lib/work-type'

const NAMES = [
  '이예서',
  '나윤주',
  '오찬빈',
  '임도연',
  '이영인',
  '이한서',
  '홍재민',
  '신유인',
  '조윤주',
  '강병민',
  '김가을',
  '이현우',
  '석은규',
  '김윤겸',
  '임혜정',
  '채지연',
  '박건민',
  '진유석',
  '박범찬',
  '유태영',
  '박경완',
  '김지은',
]

const APPLY = process.argv.includes('--apply')

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

async function main() {
  const isProd = process.env.DATABASE_URL?.includes('railway') ?? false
  console.log(`DB:     ${isProd ? 'PROD (Railway)' : 'LOCAL'}`)
  console.log(`Mode:   ${APPLY ? 'APPLY (writes)' : 'DRY-RUN (read-only)'}`)
  console.log(`Target: ${NAMES.length} unique names\n`)

  const missing: string[] = []
  const duplicates: { name: string; count: number }[] = []
  const toUpdate: {
    id: string
    name: string
    before: string | null
    after: string | null
  }[] = []
  const alreadySet: string[] = []

  for (const name of NAMES) {
    const coaches = await prisma.coach.findMany({
      where: { name, deletedAt: null },
      select: { id: true, name: true, workType: true, employeeId: true, affiliation: true },
    })

    if (coaches.length === 0) {
      missing.push(name)
      continue
    }
    if (coaches.length > 1) {
      duplicates.push({ name, count: coaches.length })
    }

    for (const coach of coaches) {
      const merged = mergeWorkTypeStrings(coach.workType, '삼전 DX')
      if (merged === coach.workType) {
        alreadySet.push(coach.name)
      } else {
        toUpdate.push({
          id: coach.id,
          name: coach.name,
          before: coach.workType,
          after: merged,
        })
      }
    }
  }

  console.log(`=== Missing (DB에 없음) ===`)
  console.log(missing.length === 0 ? '(none)' : missing.join(', '))

  console.log(`\n=== Duplicates (동명이인) ===`)
  if (duplicates.length === 0) {
    console.log('(none)')
  } else {
    for (const d of duplicates) console.log(`- ${d.name}: ${d.count}명`)
    console.log('※ 동명이인은 전원 일괄 업데이트됩니다. 구분 필요하면 중단 후 확인하세요.')
  }

  console.log(`\n=== 이미 삼전 DX 포함 (skip) ===`)
  console.log(alreadySet.length === 0 ? '(none)' : alreadySet.join(', '))

  console.log(`\n=== 업데이트 대상 (${toUpdate.length}건) ===`)
  for (const u of toUpdate) {
    console.log(`- ${u.name}: "${u.before ?? ''}" → "${u.after}"`)
  }

  if (APPLY && toUpdate.length > 0) {
    console.log(`\nApplying to ${isProd ? 'PROD' : 'LOCAL'}...`)
    for (const u of toUpdate) {
      await prisma.coach.update({
        where: { id: u.id },
        data: { workType: u.after },
      })
      console.log(`✓ ${u.name}`)
    }
    console.log(`\n완료: ${toUpdate.length}건 업데이트`)
  } else if (!APPLY) {
    console.log(`\n(DRY-RUN: 변경 없음. 실행하려면 --apply 추가)`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
