import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'
import { SCOUTING_REQUEST_TRIGGER } from '@/lib/scouting-state-machine'
import { createNotification, expireScoutingRequestNotifications } from '@/lib/notification-service'
import { toDateOnly } from '@/lib/date-utils'

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
      where.date = { gte: toDateOnly(date), lte: toDateOnly(endDate) }
    } else if (date) {
      where.date = toDateOnly(date)
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

    const { coachId, date, note, courseDescription, extraNote, courseId, courseName, hireStart, hireEnd, mode } = (await request.json()) as {
      coachId: string
      date: string
      note?: string
      courseDescription?: string
      extraNote?: string
      courseId?: string
      courseName?: string
      hireStart?: string
      hireEnd?: string
      mode?: 'toggle' | 'upsert'
    }

    if (!coachId || !date) {
      return NextResponse.json({ error: 'coachId and date required' }, { status: 400 })
    }

    const trimmedCourseName = courseName?.trim() || null
    // courseDescription / extraNote가 별도로 오면 마커 포맷으로 합침
    const composedNote = (courseDescription?.trim() || extraNote?.trim())
      ? [
          courseDescription?.trim() ? `[과정설명] ${courseDescription.trim()}` : '',
          extraNote?.trim() ? `[기타] ${extraNote.trim()}` : '',
        ].filter(Boolean).join('\n')
      : null
    const trimmedNote = composedNote || note?.trim() || null
    const hasNoteInput = note !== undefined || courseDescription !== undefined || extraNote !== undefined
    const trimmedHireStart = hireStart?.trim() || null
    const trimmedHireEnd = hireEnd?.trim() || null

    if (trimmedCourseName && trimmedCourseName.length > 200) {
      return NextResponse.json({ error: '과정명은 200자 이내여야 합니다' }, { status: 400 })
    }

    const dateObj = toDateOnly(date)
    const nextDateObj = new Date(dateObj)
    nextDateObj.setUTCDate(nextDateObj.getUTCDate() + 1)

    const existing = await prisma.scouting.findFirst({
      where: {
        coachId,
        managerId: auth.manager.id,
        date: {
          gte: dateObj,
          lt: nextDateObj,
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (existing) {
      if (existing.status === 'cancelled') {
        // cancelled -> scouting 복원 (재섭외)
        const updated = await prisma.scouting.update({
          where: { id: existing.id },
          data: {
            status: 'scouting',
            ...(courseId !== undefined && { courseId: courseId || null }),
            ...(courseName !== undefined && { courseName: trimmedCourseName }),
            ...(hasNoteInput && { note: trimmedNote }),
            ...(hireStart !== undefined && { hireStart: trimmedHireStart }),
            ...(hireEnd !== undefined && { hireEnd: trimmedHireEnd }),
          },
          select: {
            id: true, coachId: true, date: true, status: true, hireStart: true, hireEnd: true,
            manager: { select: { id: true, name: true } },
            coach: { select: { id: true, name: true, accessToken: true } },
          },
        })

        // T1 알림 — 코치에게 찜꽁
        const dateStr = updated.date.toISOString().slice(0, 10)
        try {
          await createNotification({
            trigger: SCOUTING_REQUEST_TRIGGER,
            recipientCoachId: updated.coachId,
            data: {
              scoutingId: updated.id,
              coachId: updated.coachId,
              managerId: auth.manager.id,
              managerName: updated.manager.name,
              managerEmail: auth.manager.email,
              date: dateStr,
              hireStart: updated.hireStart ?? undefined,
              hireEnd: updated.hireEnd ?? undefined,
              accessToken: updated.coach.accessToken,
              clickUrl: `/coach?token=${updated.coach.accessToken}`,
            },
          })
        } catch (notificationError) {
          console.error('[POST /api/scoutings] Notification error (restore):', notificationError)
        }

        return NextResponse.json({ action: 'added', scouting: updated })
      }

      // upsert 모드: 기존 섭외를 취소하지 않고 메타데이터 갱신
      if (mode === 'upsert') {
        const updated = await prisma.scouting.update({
          where: { id: existing.id },
          data: {
            ...(courseId !== undefined && { courseId: courseId || null }),
            ...(courseName !== undefined && { courseName: trimmedCourseName }),
            ...(hasNoteInput && { note: trimmedNote }),
            ...(hireStart !== undefined && { hireStart: trimmedHireStart }),
            ...(hireEnd !== undefined && { hireEnd: trimmedHireEnd }),
          },
          select: { id: true, status: true, courseId: true, courseName: true, note: true, hireStart: true, hireEnd: true },
        })
        return NextResponse.json({ action: 'updated', scouting: updated })
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
    let scouting
    try {
      scouting = await prisma.scouting.create({
        data: {
          coachId,
          managerId: auth.manager.id,
          date: dateObj,
          note: trimmedNote,
          courseId: courseId || null,
          courseName: trimmedCourseName,
          hireStart: trimmedHireStart,
          hireEnd: trimmedHireEnd,
        },
        select: {
          id: true, coachId: true, date: true, status: true, hireStart: true, hireEnd: true,
          manager: { select: { id: true, name: true } },
          coach: { select: { id: true, name: true, accessToken: true } },
        },
      })
    } catch (createError) {
      // 빠른 연속 요청이나 날짜 정규화 차이로 중복 생성이 날 수 있어,
      // 다시 조회해서 기존 레코드를 업데이트/복원 경로로 처리한다.
      const retryExisting = await prisma.scouting.findFirst({
        where: {
          coachId,
          managerId: auth.manager.id,
          date: {
            gte: dateObj,
            lt: nextDateObj,
          },
        },
        orderBy: { createdAt: 'desc' },
      })
      if (!retryExisting) {
        throw createError
      }

      if (retryExisting.status === 'cancelled') {
        const restored = await prisma.scouting.update({
          where: { id: retryExisting.id },
          data: {
            status: 'scouting',
            ...(courseId !== undefined && { courseId: courseId || null }),
            ...(courseName !== undefined && { courseName: trimmedCourseName }),
            ...(hasNoteInput && { note: trimmedNote }),
            ...(hireStart !== undefined && { hireStart: trimmedHireStart }),
            ...(hireEnd !== undefined && { hireEnd: trimmedHireEnd }),
          },
          select: {
            id: true, coachId: true, date: true, status: true, hireStart: true, hireEnd: true,
            manager: { select: { id: true, name: true } },
            coach: { select: { id: true, name: true, accessToken: true } },
          },
        })
        const dateStr = restored.date.toISOString().slice(0, 10)
        try {
          await createNotification({
            trigger: SCOUTING_REQUEST_TRIGGER,
            recipientCoachId: restored.coachId,
            data: {
              scoutingId: restored.id,
              coachId: restored.coachId,
              managerId: auth.manager.id,
              managerName: restored.manager.name,
              managerEmail: auth.manager.email,
              date: dateStr,
              hireStart: restored.hireStart ?? undefined,
              hireEnd: restored.hireEnd ?? undefined,
              accessToken: restored.coach.accessToken,
              clickUrl: `/coach?token=${restored.coach.accessToken}`,
            },
          })
        } catch (notificationError) {
          console.error('[POST /api/scoutings] Notification error (retry restore):', notificationError)
        }
        return NextResponse.json({ action: 'added', scouting: restored })
      }

      if (mode === 'upsert') {
        const updated = await prisma.scouting.update({
          where: { id: retryExisting.id },
          data: {
            ...(courseId !== undefined && { courseId: courseId || null }),
            ...(courseName !== undefined && { courseName: trimmedCourseName }),
            ...(hasNoteInput && { note: trimmedNote }),
            ...(hireStart !== undefined && { hireStart: trimmedHireStart }),
            ...(hireEnd !== undefined && { hireEnd: trimmedHireEnd }),
          },
          select: { id: true, status: true, courseId: true, courseName: true, note: true, hireStart: true, hireEnd: true },
        })
        return NextResponse.json({ action: 'updated', scouting: updated })
      }

      const cancelled = await prisma.scouting.update({
        where: { id: retryExisting.id },
        data: { status: 'cancelled' },
      })
      await expireScoutingRequestNotifications(cancelled.id)
      return NextResponse.json({ action: 'removed' })
    }

    // T1 알림 — 코치에게 찜꽁
    const dateStr = scouting.date.toISOString().slice(0, 10)
    try {
      await createNotification({
        trigger: SCOUTING_REQUEST_TRIGGER,
        recipientCoachId: scouting.coachId,
        data: {
          scoutingId: scouting.id,
          coachId: scouting.coachId,
          managerId: auth.manager.id,
          managerName: scouting.manager.name,
          managerEmail: auth.manager.email,
          date: dateStr,
          hireStart: scouting.hireStart ?? undefined,
          hireEnd: scouting.hireEnd ?? undefined,
          accessToken: scouting.coach.accessToken,
          clickUrl: `/coach?token=${scouting.coach.accessToken}`,
        },
      })
    } catch (notificationError) {
      console.error('[POST /api/scoutings] Notification error (create):', notificationError)
    }

    return NextResponse.json({ action: 'added', scouting })
  } catch (e) {
    console.error('[POST /api/scoutings] Error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
