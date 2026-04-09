/**
 * 삼전 DS/DX 숨김 로직 검증 (read-only).
 *
 * Usage:
 *   # Local
 *   npx tsx scripts/verify-samsung-hiding.ts
 *
 *   # Prod
 *   DATABASE_URL="$PRODUCTION_DATABASE_URL" npx tsx scripts/verify-samsung-hiding.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: false })

import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import {
  getCoachSamsungExclusionWhere,
  getSamsungExclusions,
  getSamsungHideConfig,
} from '../src/lib/samsung-config'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

async function main() {
  const isProd = process.env.DATABASE_URL?.includes('railway') ?? false
  console.log(`DB: ${isProd ? 'PROD (Railway)' : 'LOCAL'}`)

  const cfg = getSamsungHideConfig()
  console.log(`Config: ${JSON.stringify(cfg)}`)

  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  console.log(`Current yearMonth: ${ym}`)

  const excl = getSamsungExclusions(ym)
  console.log(`Exclusions: ${JSON.stringify(excl)}`)

  const samsungWhere = getCoachSamsungExclusionWhere()
  console.log(`Where fragment: ${JSON.stringify(samsungWhere)}`)

  // 전체 코치 (삼전 포함) vs 필터 후
  const totalAll = await prisma.coach.count({
    where: { deletedAt: null, status: { not: 'pending' } },
  })
  const totalFiltered = await prisma.coach.count({
    where: { deletedAt: null, status: { not: 'pending' }, ...samsungWhere },
  })

  const dsCount = await prisma.coach.count({
    where: { deletedAt: null, status: { not: 'pending' }, workType: { contains: '삼전 DS' } },
  })
  const dxCount = await prisma.coach.count({
    where: { deletedAt: null, status: { not: 'pending' }, workType: { contains: '삼전 DX' } },
  })

  console.log(`\n전체 코치 (active+inactive): ${totalAll}`)
  console.log(`  ├─ 삼전 DS 포함: ${dsCount}`)
  console.log(`  └─ 삼전 DX 포함: ${dxCount}`)
  console.log(`필터 적용 후 노출: ${totalFiltered}`)
  console.log(`숨겨진 코치 수: ${totalAll - totalFiltered}`)

  // Detail: list hidden coaches
  if (totalAll - totalFiltered > 0) {
    const hidden = await prisma.coach.findMany({
      where: {
        deletedAt: null,
        status: { not: 'pending' },
        OR: [
          ...(excl.excludeDS ? [{ workType: { contains: '삼전 DS' } }] : []),
          ...(excl.excludeDX ? [{ workType: { contains: '삼전 DX' } }] : []),
        ],
      },
      select: { name: true, workType: true },
      orderBy: { name: 'asc' },
    })
    console.log(`\n숨겨진 코치 목록:`)
    for (const c of hidden) {
      console.log(`  - ${c.name}: ${c.workType}`)
    }
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
