import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'
import { canTransition, getNotificationTrigger } from '@/lib/scouting-state-machine'
import { createNotification, expireScoutingRequestNotifications } from '@/lib/notification-service'
import { cancelEngagementScheduleForScouting } from '@/lib/engagement-cascade'
import type { ScoutingStatus } from '@/generated/prisma/client'

type RouteParams = { params: Promise<{ id: string }> }

// PATCH /api/scoutings/:id — update scouting status (manager)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await requireManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const { status, courseName, hireStart, hireEnd, scheduleText } = body as {
    status: string; courseName?: string; hireStart?: string; hireEnd?: string; scheduleText?: string
  }

  const scouting = await prisma.scouting.findUnique({
    where: { id },
    include: {
      coach: { select: { id: true, name: true, accessToken: true, workType: true } },
      manager: { select: { id: true, name: true, email: true } },
      course: { select: { id: true, name: true, startDate: true, endDate: true, location: true, deletedAt: true } },
    },
  })
  if (!scouting) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (scouting.managerId !== auth.manager.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (status === 'confirmed' && scouting.course?.deletedAt) {
    return NextResponse.json(
      { error: '과정이 삭제되어 확정할 수 없습니다' },
      { status: 409 },
    )
  }

  // canTransition 기반 검증
  if (!canTransition(scouting.status, status as ScoutingStatus, 'manager')) {
    const message = scouting.status === 'scouting' && status === 'confirmed'
      ? '코치 수락이 필요합니다'
      : '유효하지 않은 상태 전이입니다'
    return NextResponse.json({ error: message }, { status: 409 })
  }

  // Initial update outside confirm transaction — acceptable: single manager per scouting, no concurrent edits
  const resolvedCourseName = scouting.course?.name ?? courseName
  const updated = await prisma.scouting.update({
    where: { id },
    data: {
      status: status as ScoutingStatus,
      ...(resolvedCourseName !== undefined && { courseName: resolvedCourseName }),
      ...(hireStart !== undefined && { hireStart }),
      ...(hireEnd !== undefined && { hireEnd }),
      ...(scheduleText !== undefined && { scheduleText }),
    },
    select: { id: true, status: true, courseName: true, hireStart: true, hireEnd: true, scheduleText: true },
  })

  // 취소 시 기존 알림 만료 + confirmed면 EngagementSchedule cascade
  if (status === 'cancelled') {
    await expireScoutingRequestNotifications(id)
    if (scouting.status === 'confirmed') {
      await cancelEngagementScheduleForScouting(scouting, scouting.course)
    }
  }

  // 수정 시 (scouting→scouting) 기존 T1 만료 후 새 알림 발송
  if (scouting.status === 'scouting' && status === 'scouting') {
    await expireScoutingRequestNotifications(id)
  }

  // 알림 트리거
  const trigger = getNotificationTrigger(scouting.status, status as ScoutingStatus)
  if (trigger) {
    const dateStr = scouting.date.toISOString().slice(0, 10)
    const clickUrl = trigger.recipientRole === 'coach'
      ? `/coach?token=${scouting.coach.accessToken}`
      : `/coaches/${scouting.coachId}`

    await createNotification({
      trigger,
      recipientCoachId: trigger.recipientRole === 'coach' ? scouting.coachId : undefined,
      recipientManagerId: trigger.recipientRole === 'manager' ? scouting.managerId : undefined,
      data: {
        scoutingId: scouting.id,
        coachId: scouting.coachId,
        managerId: scouting.managerId,
        coachName: scouting.coach.name,
        managerName: scouting.manager.name,
        managerEmail: scouting.manager.email || undefined,
        date: dateStr,
        courseName: scouting.courseName || undefined,
        accessToken: scouting.coach.accessToken,
        clickUrl,
      },
    })
  }

  // 확정 시 engagement 자동 생성 (transaction으로 원자성 보장)
  if (status === 'confirmed') {
    const dateStr = scouting.date.toISOString().slice(0, 10)
    const engCourseName = resolvedCourseName || scouting.courseName || ''
    const courseStartDate = scouting.course?.startDate ?? scouting.date
    const courseEndDate = scouting.course?.endDate ?? scouting.date

    await prisma.$transaction(async (tx) => {
      // 기존 engagement 찾기 (같은 코치 + 과정명)
      let engagement = await tx.engagement.findFirst({
        where: {
          coachId: scouting.coachId,
          courseName: engCourseName,
          startDate: courseStartDate,
          endDate: courseEndDate,
        },
      })

      if (!engagement) {
        engagement = await tx.engagement.create({
          data: {
            coachId: scouting.coachId,
            courseName: engCourseName,
            status: 'scheduled',
            startDate: courseStartDate,
            endDate: courseEndDate,
            startTime: hireStart ?? scouting.hireStart,
            endTime: hireEnd ?? scouting.hireEnd,
            location: scouting.course?.location ?? null,
            workType: scouting.coach.workType ?? null,
            hiredBy: auth.manager.name,
          },
        })
      }

      // engagementSchedule 추가 (중복 체크)
      const existingSchedule = await tx.engagementSchedule.findFirst({
        where: { engagementId: engagement.id, coachId: scouting.coachId, date: scouting.date },
      })
      if (!existingSchedule && scouting.hireStart && scouting.hireEnd) {
        await tx.engagementSchedule.create({
          data: {
            engagementId: engagement.id,
            coachId: scouting.coachId,
            date: scouting.date,
            startTime: hireStart ?? scouting.hireStart,
            endTime: hireEnd ?? scouting.hireEnd,
          },
        })
      }
    })
  }

  // 확정 시 코치 정보를 응답에 포함 (클립보드 복사용)
  if (status === 'confirmed') {
    const coach = scouting.coach
    const dateStr = scouting.date.toISOString().slice(0, 10)
    return NextResponse.json({
      ...updated,
      sheetRow: {
        employeeId: (await prisma.coach.findUnique({ where: { id: scouting.coachId }, select: { employeeId: true } }))?.employeeId || '',
        name: coach.name,
        workType: '',
        managerName: auth.manager.name,
        startDate: dateStr,
        email: '',
        phone: '',
        phoneLast4: '',
      },
    })
  }

  return NextResponse.json(updated)
}

