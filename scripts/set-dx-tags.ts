import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

async function main() {
  const result = await prisma.coach.updateMany({
    where: { workType: { contains: '삼전 DX' }, deletedAt: null, status: 'active' },
    data: { dxTag: '기본' },
  })
  console.log('Updated:', result.count, 'coaches')
  await prisma.$disconnect()
}

main()
