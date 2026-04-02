import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractToken, validateCoachToken } from '@/lib/coach-auth'
import { canTransition, getNotificationTrigger } from '@/lib/scouting-state-machine'
import { createNotification } from '@/lib/notification-service'
import type { ScoutingStatus } from '@/generated/prisma/client'

type RouteParams = { params: Promise<{ id: string }> }

// PATCH /api/coach/scoutings/:id — 코치 수락/거절
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const token = extractToken(request)
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const coach = await validateCoachToken(token)
  if (!coach) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const { action } = (await request.json()) as { action: string }

  if (action !== 'accept' && action !== 'reject') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const scouting = await prisma.scouting.findUnique({
    where: { id },
    include: {
      manager: { select: { id: true, name: true } },
      coach: { select: { id: true, name: true, accessToken: true } },
    },
  })

  if (!scouting) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (scouting.coachId !== coach.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const targetStatus: ScoutingStatus = action === 'accept' ? 'accepted' : 'rejected'

  if (!canTransition(scouting.status, targetStatus, 'coach')) {
    return NextResponse.json(
      { error: '이미 처리된 섭외입니다' },
      { status: 409 },
    )
  }

  const updated = await prisma.scouting.update({
    where: { id },
    data: { status: targetStatus },
    select: { id: true, status: true },
  })

  // 알림 생성 (T2 or T3 — 매니저에게)
  const trigger = getNotificationTrigger(scouting.status, targetStatus)
  if (trigger) {
    const dateStr = scouting.date.toISOString().slice(0, 10)
    const clickUrl = trigger.clickUrlPattern
      .replace('{coachId}', scouting.coachId)

    await createNotification({
      trigger,
      recipientManagerId: scouting.managerId,
      data: {
        scoutingId: scouting.id,
        coachId: scouting.coachId,
        managerId: scouting.managerId,
        coachName: scouting.coach.name,
        managerName: scouting.manager.name,
        date: dateStr,
        courseName: scouting.courseName || undefined,
        clickUrl,
      },
    })
  }

  return NextResponse.json(updated)
}
