import { config } from 'dotenv'
config({ path: '.env.local' })

import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { randomBytes } from 'crypto'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

// 3월 평일 생성 헬퍼
function marchWeekdays(year = 2026): string[] {
  const days: string[] = []
  for (let d = 1; d <= 31; d++) {
    const date = new Date(year, 2, d) // month 0-indexed
    const dow = date.getDay()
    if (dow >= 1 && dow <= 5) days.push(`${year}-03-${String(d).padStart(2, '0')}`)
  }
  return days
}

const weekdays = marchWeekdays()

interface SlotInput {
  date: string
  startTime: string
  endTime: string
}

// 코치 A: 풀타임 — 평일 매일 09:00~18:00
function coachASlots(): SlotInput[] {
  return weekdays.map(date => ({ date, startTime: '09:00', endTime: '18:00' }))
}

// 코치 B: 오전만 + 화목 종일 — 월수금 09:00~12:00, 화목 09:00~18:00
function coachBSlots(): SlotInput[] {
  const slots: SlotInput[] = []
  for (const date of weekdays) {
    const dow = new Date(date).getDay()
    if (dow === 2 || dow === 4) {
      // 화, 목 종일
      slots.push({ date, startTime: '09:00', endTime: '18:00' })
    } else {
      // 월, 수, 금 오전만
      slots.push({ date, startTime: '09:00', endTime: '12:00' })
    }
  }
  return slots
}

// 코치 C: 오후/저녁 — 평일 14:00~21:00, 단 격주 수요일은 쉼
function coachCSlots(): SlotInput[] {
  const slots: SlotInput[] = []
  let wedCount = 0
  for (const date of weekdays) {
    const dow = new Date(date).getDay()
    if (dow === 3) {
      wedCount++
      if (wedCount % 2 === 0) continue // 격주 수 쉼
    }
    slots.push({ date, startTime: '14:00', endTime: '21:00' })
  }
  return slots
}

const TEST_COACHES = [
  {
    name: 't김하나',
    phone: '010-0000-0001',
    email: 'test-fulltime@example.com',
    workType: '실습코치',
    availabilityDetail: '평일 종일 가능',
    slots: coachASlots(),
    fields: ['웹개발', 'AI/ML'],
    engagement: {
      courseName: 'React 실습 과정',
      status: 'in_progress' as const,
      startDate: '2026-03-09',
      endDate: '2026-03-20',
      startTime: '10:00',
      endTime: '13:00',
      hiredBy: '테스트매니저',
      // 월~금 10:00~13:00 (2주)
      scheduleDates: weekdays.filter(d => d >= '2026-03-09' && d <= '2026-03-20'),
    },
  },
  {
    name: 't이두리',
    phone: '010-0000-0002',
    email: 'test-parttime@example.com',
    workType: '운영조교',
    availabilityDetail: '화목 종일, 월수금 오전만',
    slots: coachBSlots(),
    fields: ['데이터분석'],
    engagement: null,
  },
  {
    name: 't박세찬',
    phone: '010-0000-0003',
    email: 'test-evening@example.com',
    workType: '실습코치',
    availabilityDetail: '오후~저녁 (14-21시), 격주 수 OFF',
    slots: coachCSlots(),
    fields: ['웹개발', 'DevOps'],
    engagement: {
      courseName: 'Python 야간반',
      status: 'scheduled' as const,
      startDate: '2026-03-16',
      endDate: '2026-03-27',
      startTime: '18:00',
      endTime: '21:00',
      hiredBy: '테스트매니저',
      scheduleDates: weekdays.filter(d => d >= '2026-03-16' && d <= '2026-03-27'),
    },
  },
]

async function main() {
  console.log('Seeding 3 test coaches for March 2026...\n')

  // 이전 이름 포함 정리
  const oldNames = ['테스트_김풀타임', '테스트_이파트', '테스트_박저녁', '김풀타임', '이파트', '박저녁']
  const allNames = [...oldNames, ...TEST_COACHES.map(c => c.name)]
  for (const name of allNames) {
    const old = await prisma.coach.findFirst({ where: { name } })
    if (old) {
      await prisma.coach.delete({ where: { id: old.id } })
      console.log(`  Cleaned up: ${name}`)
    }
  }

  for (const tc of TEST_COACHES) {

    // 코치 생성
    const coach = await prisma.coach.create({
      data: {
        name: tc.name,
        phone: tc.phone,
        email: tc.email,
        workType: tc.workType,
        availabilityDetail: tc.availabilityDetail,
        accessToken: randomBytes(32).toString('hex'),
        status: 'active',
      },
    })
    console.log(`  Created coach: ${tc.name} (${coach.id})`)

    // 분야 연결
    for (const fieldName of tc.fields) {
      const field = await prisma.field.findUnique({ where: { name: fieldName } })
      if (field) {
        await prisma.coachField.create({
          data: { coachId: coach.id, fieldId: field.id },
        })
      }
    }

    // 가용 스케줄 입력
    await prisma.coachSchedule.createMany({
      data: tc.slots.map(s => ({
        coachId: coach.id,
        date: new Date(s.date),
        startTime: s.startTime,
        endTime: s.endTime,
      })),
    })
    console.log(`  → ${tc.slots.length} schedule slots`)

    // 투입이력 + engagement_schedules
    if (tc.engagement) {
      const eng = tc.engagement
      const engagement = await prisma.engagement.create({
        data: {
          coachId: coach.id,
          courseName: eng.courseName,
          status: eng.status,
          startDate: new Date(eng.startDate),
          endDate: new Date(eng.endDate),
          startTime: eng.startTime,
          endTime: eng.endTime,
          hiredBy: eng.hiredBy,
        },
      })
      await prisma.engagementSchedule.createMany({
        data: eng.scheduleDates.map(d => ({
          engagementId: engagement.id,
          coachId: coach.id,
          date: new Date(d),
          startTime: eng.startTime!,
          endTime: eng.endTime!,
        })),
      })
      console.log(`  → engagement "${eng.courseName}" (${eng.scheduleDates.length} days)`)
    }

    console.log()
  }

  console.log('Done!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
