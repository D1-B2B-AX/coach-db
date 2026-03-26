import { config } from 'dotenv'
config({ path: '.env.local' })

import { config } from 'dotenv'
config({ path: '.env.local' })

import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

const FIELDS = [
  'AI/ML', '웹개발', '데이터분석', '모바일', '클라우드',
  'DevOps', '보안', 'PM/PO', 'UX/UI', '블록체인',
]

const CURRICULUMS = [
  'Python 기초', 'Python 심화', 'JavaScript 기초', 'React',
  'SQL 기초', 'SQL 심화', '데이터 분석', 'AI 활용',
  'Java', 'Spring Boot', 'Django', 'Node.js',
]

async function main() {
  console.log('Seeding master data...')

  for (const name of FIELDS) {
    await prisma.field.upsert({
      where: { name },
      update: {},
      create: { name },
    })
  }
  console.log(`Seeded ${FIELDS.length} fields`)

  for (const name of CURRICULUMS) {
    await prisma.curriculum.upsert({
      where: { name },
      update: {},
      create: { name },
    })
  }
  console.log(`Seeded ${CURRICULUMS.length} curriculums`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
