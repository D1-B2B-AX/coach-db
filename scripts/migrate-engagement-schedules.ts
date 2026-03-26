import { config } from 'dotenv'
config({ path: '.env.local' })

import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

async function main() {
  const engagements = await prisma.engagement.findMany({
    where: { status: { not: 'cancelled' } },
    include: { coach: { select: { id: true, name: true } } },
  })

  console.log(`처리할 engagement: ${engagements.length}건`)

  let created = 0
  let skipped = 0

  for (const eng of engagements) {
    // Find matching coach_schedules within engagement date range
    const schedules = await prisma.coachSchedule.findMany({
      where: {
        coachId: eng.coachId,
        date: { gte: eng.startDate, lte: eng.endDate },
      },
    })

    if (schedules.length > 0) {
      for (const s of schedules) {
        const existing = await prisma.engagementSchedule.findFirst({
          where: {
            engagementId: eng.id,
            coachId: eng.coachId,
            date: s.date,
            startTime: s.startTime,
            endTime: s.endTime,
          },
        })
        if (!existing) {
          await prisma.engagementSchedule.create({
            data: {
              engagementId: eng.id,
              coachId: eng.coachId,
              date: s.date,
              startTime: s.startTime,
              endTime: s.endTime,
            },
          })
          created++
        } else {
          skipped++
        }
      }
    } else if (eng.startTime && eng.endTime) {
      // No schedule data — generate from date range + time (weekdays only)
      const cursor = new Date(eng.startDate)
      while (cursor <= eng.endDate) {
        const dow = cursor.getDay()
        if (dow !== 0 && dow !== 6) {
          const dateVal = new Date(cursor)
          const existing = await prisma.engagementSchedule.findFirst({
            where: {
              engagementId: eng.id,
              coachId: eng.coachId,
              date: dateVal,
              startTime: eng.startTime!,
              endTime: eng.endTime!,
            },
          })
          if (!existing) {
            await prisma.engagementSchedule.create({
              data: {
                engagementId: eng.id,
                coachId: eng.coachId,
                date: dateVal,
                startTime: eng.startTime!,
                endTime: eng.endTime!,
              },
            })
            created++
          } else {
            skipped++
          }
        }
        cursor.setDate(cursor.getDate() + 1)
      }
    }
  }

  console.log(`engagement_schedules 생성: ${created}건, 중복 스킵: ${skipped}건`)
  const total = await prisma.engagementSchedule.count()
  console.log(`전체 engagement_schedules: ${total}건`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
