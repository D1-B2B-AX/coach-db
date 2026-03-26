import { config } from 'dotenv'
config({ path: '.env.local' })

import { config } from 'dotenv'
config({ path: '.env.local' })

import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { randomBytes } from 'crypto'
import * as fs from 'fs'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

function generateToken(): string {
  return randomBytes(32).toString('hex')
}

interface CoachData {
  name: string
  phone?: string | null
  email?: string | null
  birthDate?: string | null
  affiliation?: string | null
  workType?: string | null
  selfNote?: string | null
  fields?: string[]
  curriculums?: string[]
}

async function main() {
  const dataPath = process.argv[2] || 'scripts/coaches-data.json'

  if (!fs.existsSync(dataPath)) {
    console.log(`Data file not found: ${dataPath}`)
    console.log('Create a JSON file with coach data. Example:')
    console.log(JSON.stringify([{
      name: '김코치',
      phone: '010-1234-5678',
      email: 'kim@example.com',
      fields: ['AI/ML'],
      engagements: [{
        courseName: 'Python 기초',
        startDate: '2026-01-10',
        endDate: '2026-01-12',
        status: 'completed',
        rating: 4,
      }],
    }], null, 2))
    return
  }

  const coaches: CoachData[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
  console.log(`Migrating ${coaches.length} coaches...`)

  for (const data of coaches) {
    const coach = await prisma.coach.create({
      data: {
        name: data.name,
        phone: data.phone || undefined,
        email: data.email || undefined,
        birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
        affiliation: data.affiliation || undefined,
        workType: data.workType || undefined,
        selfNote: data.selfNote || undefined,
        accessToken: generateToken(),
        fields: data.fields?.length ? {
          create: await Promise.all(data.fields.map(async (name) => {
            const field = await prisma.field.upsert({
              where: { name },
              update: {},
              create: { name },
            })
            return { fieldId: field.id }
          })),
        } : undefined,
        curriculums: data.curriculums?.length ? {
          create: await Promise.all(data.curriculums.map(async (name) => {
            const curriculum = await prisma.curriculum.upsert({
              where: { name },
              update: {},
              create: { name },
            })
            return { curriculumId: curriculum.id }
          })),
        } : undefined,
      },
    })
    console.log(`Created: ${coach.name} (token: ${coach.accessToken.slice(0, 8)}...)`)
  }

  const total = await prisma.coach.count()
  console.log(`Migration complete. Total coaches: ${total}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
