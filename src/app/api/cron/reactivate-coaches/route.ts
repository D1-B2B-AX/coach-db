import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST /api/cron/reactivate-coaches
// 복귀 희망 시기가 지난 inactive 코치를 active로 전환 + 알림 발송
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.SYNC_API_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // returnDate <= today인 inactive 코치 조회
  const coaches = await prisma.coach.findMany({
    where: {
      status: 'inactive',
      returnDate: { lte: today },
    },
    select: {
      id: true,
      name: true,
      returnDate: true,
      accessToken: true,
    },
  })

  if (coaches.length === 0) {
    return NextResponse.json({ reactivated: 0 })
  }

  const results: string[] = []

  for (const coach of coaches) {
    // active로 전환, returnDate/statusNote 초기화
    await prisma.coach.update({
      where: { id: coach.id },
      data: {
        status: 'active',
        statusNote: null,
        returnDate: null,
      },
    })

    // 코치에게 복귀 알림 생성
    await prisma.notification.create({
      data: {
        type: 'coach_reactivated',
        title: '활동이 재개되었습니다',
        body: '복귀 희망 시기가 되어 활동이 자동으로 재개되었습니다. 일정을 입력해주세요.',
        coachId: coach.id,
        data: {
          clickUrl: `/coach?token=${coach.accessToken}`,
        },
      },
    })

    results.push(coach.name)
  }

  console.log(`[reactivate-coaches] ${results.length}명 복귀:`, results.join(', '))

  return NextResponse.json({ reactivated: results.length, coaches: results })
}
