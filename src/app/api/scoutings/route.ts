import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'
import { SCOUTING_REQUEST_TRIGGER } from '@/lib/scouting-state-machine'
import { createNotification, expireScoutingRequestNotifications } from '@/lib/notification-service'

// GET /api/scoutings?coachId=...&date=...&endDate=...&managerId=...&status=...
export async function GET(request: NextRequest) {
  try {
    const auth = await requireManager()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const coachId = searchParams.get('coachId')
    const date = searchParams.get('date')
    const endDate = searchParams.get('endDate')
    const managerId = searchParams.get('managerId')
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {}
    if (coachId) where.coachId = coachId
    if (managerId) where.managerId = auth.manager.id
    if (status) where.status = status
    if (date && endDate) {
      where.date = { gte: new Date(date), lte: new Date(endDate) }
    } else if (date) {
      where.date = new Date(date)
    }

    const courseId = searchParams.get('courseId')
    if (courseId) where.courseId = courseId

    const scoutings = await prisma.scouting.findMany({
      where,
      select: {
        id: true,
        coachId: true,
        courseId: true,
        date: true,
        note: true,
        status: true,
        courseName: true,
        hireStart: true,
        hireEnd: true,
        scheduleText: true,
        coach: { select: { id: true, name: true, employeeId: true, email: true, phone: true, workType: true } },
        manager: { select: { id: true, name: true } },
        course: { select: { id: true, name: true, startDate: true, endDate: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ scoutings })
  } catch (e) {
    console.error('[GET /api/scoutings] Error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/scoutings — toggle scouting (create or cancel/restore)
export async function POST(request: NextRequest) {
  try {
    const auth = await requireManager()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { coachId, date, note, courseId } = (await request.json()) as {
      coachId: string
      date: string
      note?: string
      courseId?: string
    }

    if (!coachId || !date) {
      return NextResponse.json({ error: 'coachId and date required' }, { status: 400 })
    }

    const dateObj = new Date(date)

    const existing = await prisma.scouting.findUnique({
      where: {
        coachId_date_managerId: {
          coachId,
          date: dateObj,
          managerId: auth.manager.id,
        },
      },
    })

    if (existing) {
      if (existing.status === 'cancelled') {
        // cancelled -> scouting 복원 (재섭외)
        const updated = await prisma.scouting.update({
          where: { id: existing.id },
          data: { status: 'scouting', ...(courseId !== undefined && { courseId: courseId || null }) },
          select: {
            id: true, coachId: true, date: true, status: true,
            manager: { select: { id: true, name: true } },
            coach: { select: { id: true, name: true, accessToken: true } },
          },
        })

        // T1 알림 — 코치에게 섭외 요청
        const dateStr = updated.date.toISOString().slice(0, 10)
        await createNotification({
          trigger: SCOUTING_REQUEST_TRIGGER,
          recipientCoachId: updated.coachId,
          data: {
            scoutingId: updated.id,
            coachId: updated.coachId,
            managerId: auth.manager.id,
            managerName: updated.manager.name,
            date: dateStr,
            accessToken: updated.coach.accessToken,
            clickUrl: `/coach?token=${updated.coach.accessToken}`,
          },
        })

        return NextResponse.json({ action: 'added', scouting: updated })
      }

      // scouting/accepted -> cancelled (섭외 철회)
      await prisma.scouting.update({
        where: { id: existing.id },
        data: { status: 'cancelled' },
      })

      // 기존 T1 알림 만료 (코치 수락/거절 비활성화)
      await expireScoutingRequestNotifications(existing.id)

      return NextResponse.json({ action: 'removed' })
    }

    // 신규 생성
    const scouting = await prisma.scouting.create({
      data: {
        coachId,
        managerId: auth.manager.id,
        date: dateObj,
        note: note || null,
        courseId: courseId || null,
      },
      select: {
        id: true, coachId: true, date: true, status: true,
        manager: { select: { id: true, name: true } },
        coach: { select: { id: true, name: true, accessToken: true } },
      },
    })

    // T1 알림 — 코치에게 섭외 요청
    const dateStr = scouting.date.toISOString().slice(0, 10)
    await createNotification({
      trigger: SCOUTING_REQUEST_TRIGGER,
      recipientCoachId: scouting.coachId,
      data: {
        scoutingId: scouting.id,
        coachId: scouting.coachId,
        managerId: auth.manager.id,
        managerName: scouting.manager.name,
        date: dateStr,
        accessToken: scouting.coach.accessToken,
        clickUrl: `/coach?token=${scouting.coach.accessToken}`,
      },
    })

    return NextResponse.json({ action: 'added', scouting })
  } catch (e) {
    console.error('[POST /api/scoutings] Error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
