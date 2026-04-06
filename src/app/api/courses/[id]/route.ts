import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'
import { createNotification, expireScoutingRequestNotifications } from '@/lib/notification-service'
import { getNotificationTrigger } from '@/lib/scouting-state-machine'
import { cancelEngagementScheduleForScouting } from '@/lib/engagement-cascade'

type RouteParams = { params: Promise<{ id: string }> }

// PATCH /api/courses/:id
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireManager()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const course = await prisma.course.findUnique({ where: { id } })
    if (!course || course.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (course.managerId !== auth.manager.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { name, startDate, endDate, description, workHours, location, hourlyRate, remarks } = (await request.json()) as {
      name?: string
      startDate?: string | null
      endDate?: string | null
      description?: string | null
      workHours?: string | null
      location?: string | null
      hourlyRate?: number | string | null
      remarks?: string | null
    }

    if (name !== undefined && (!name || !name.trim())) {
      return NextResponse.json({ error: '과정명을 입력해주세요' }, { status: 400 })
    }

    const trimmedWorkHours = workHours !== undefined ? (workHours ? workHours.trim() : null) : undefined
    const trimmedLocation = location !== undefined ? (location ? location.trim() : null) : undefined
    const parsedHourlyRate = hourlyRate !== undefined
      ? (hourlyRate === null || hourlyRate === "" ? null : Number(hourlyRate))
      : undefined

    if (parsedHourlyRate !== undefined && parsedHourlyRate !== null && (!Number.isFinite(parsedHourlyRate) || parsedHourlyRate < 0)) {
      return NextResponse.json({ error: '시급은 0 이상의 숫자여야 합니다' }, { status: 400 })
    }

    const newStart = startDate !== undefined ? (startDate ? new Date(startDate) : null) : course.startDate
    const newEnd = endDate !== undefined ? (endDate ? new Date(endDate) : null) : course.endDate

    if (newEnd && !newStart) {
      return NextResponse.json({ error: '시작일 없이 종료일만 입력할 수 없습니다' }, { status: 400 })
    }
    if (newStart && newEnd && newEnd < newStart) {
      return NextResponse.json({ error: '종료일은 시작일 이후여야 합니다' }, { status: 400 })
    }

    const updated = await prisma.course.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(workHours !== undefined && { workHours: trimmedWorkHours }),
        ...(location !== undefined && { location: trimmedLocation }),
        ...(hourlyRate !== undefined && { hourlyRate: parsedHourlyRate }),
        ...(remarks !== undefined && { remarks: remarks?.trim() || null }),
      },
    })

    // 수락/확정된 찜꽁 → scouting으로 리셋 + 수정 알림 발송
    const activeScoutings = await prisma.scouting.findMany({
      where: { courseId: id, status: { in: ['accepted', 'confirmed'] } },
      include: {
        coach: { select: { id: true, name: true, accessToken: true } },
        manager: { select: { id: true, name: true, email: true } },
      },
    })
    if (activeScoutings.length > 0) {
      // confirmed 찜꽁의 EngagementSchedule soft-cancel (리셋 전)
      for (const s of activeScoutings.filter(x => x.status === 'confirmed')) {
        await cancelEngagementScheduleForScouting(s, { startDate: course.startDate, endDate: course.endDate })
      }
      await prisma.scouting.updateMany({
        where: { id: { in: activeScoutings.map(s => s.id) } },
        data: { status: 'scouting' },
      })
      const trigger = getNotificationTrigger('scouting', 'scouting')
      for (const s of activeScoutings) {
        await expireScoutingRequestNotifications(s.id)
        if (trigger) {
          const dateStr = s.date.toISOString().slice(0, 10)
          await createNotification({
            trigger,
            recipientCoachId: s.coachId,
            data: {
              scoutingId: s.id,
              coachId: s.coachId,
              managerId: s.managerId,
              coachName: s.coach.name,
              managerName: s.manager.name,
              managerEmail: s.manager.email || undefined,
              date: dateStr,
              courseName: updated.name,
              accessToken: s.coach.accessToken,
              clickUrl: `/coach?token=${s.coach.accessToken}`,
            },
          })
        }
      }
    }

    return NextResponse.json({ ...updated, resetScoutings: activeScoutings.length })
  } catch (e) {
    console.error('[PATCH /api/courses] Error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE /api/courses/:id
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireManager()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const course = await prisma.course.findUnique({ where: { id } })
    if (!course || course.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (course.managerId !== auth.manager.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Cancel active scoutings, cascade EngagementSchedule, expire notifications, send cancel alerts
    const activeScoutings = await prisma.scouting.findMany({
      where: { courseId: id, status: { in: ['scouting', 'accepted', 'confirmed'] } },
      include: {
        coach: { select: { id: true, name: true, accessToken: true } },
        manager: { select: { id: true, name: true, email: true } },
      },
    })
    if (activeScoutings.length > 0) {
      // confirmed 찜꽁의 EngagementSchedule soft-cancel
      for (const s of activeScoutings.filter(x => x.status === 'confirmed')) {
        await cancelEngagementScheduleForScouting(s, { startDate: course.startDate, endDate: course.endDate })
      }
      await prisma.scouting.updateMany({
        where: { id: { in: activeScoutings.map(s => s.id) } },
        data: { status: 'cancelled' },
      })
      for (const s of activeScoutings) {
        await expireScoutingRequestNotifications(s.id)
        // confirmed/accepted 코치에게 취소 알림 발송
        if (s.status === 'confirmed' || s.status === 'accepted') {
          const trigger = getNotificationTrigger('confirmed', 'cancelled')
          if (trigger) {
            const dateStr = s.date.toISOString().slice(0, 10)
            await createNotification({
              trigger,
              recipientCoachId: s.coachId,
              data: {
                scoutingId: s.id,
                coachId: s.coachId,
                managerId: s.managerId,
                coachName: s.coach.name,
                managerName: s.manager.name,
                managerEmail: s.manager.email || undefined,
                date: dateStr,
                courseName: course.name,
                accessToken: s.coach.accessToken,
                clickUrl: `/coach?token=${s.coach.accessToken}`,
              },
            })
          }
        }
      }
    }

    // Soft delete (keep course record for history)
    await prisma.course.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    return NextResponse.json({ success: true, cancelledScoutings: activeScoutings.length })
  } catch (e) {
    console.error('[DELETE /api/courses] Error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
