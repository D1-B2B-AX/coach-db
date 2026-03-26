import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'
import { logChanges } from '@/lib/audit'

type RouteParams = { params: Promise<{ id: string }> }

// PUT /api/engagements/:id — update an engagement
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const auth = await requireManager()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Check engagement exists — fetch full data for audit
  const existing = await prisma.engagement.findUnique({
    where: { id },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })
  }

  // Permission check: admin can edit all, others can only edit their own
  if (auth.manager.role !== 'admin' && existing.hiredBy && existing.hiredBy !== auth.manager.name) {
    return NextResponse.json({ error: '담당 매니저만 수정할 수 있습니다' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    courseName,
    status,
    startDate,
    endDate,
    startTime,
    endTime,
    location,
    rating,
    feedback,
    rehire,
    hiredBy,
  } = body as {
    courseName?: string
    status?: string
    startDate?: string
    endDate?: string
    startTime?: string | null
    endTime?: string | null
    location?: string | null
    rating?: number | null
    feedback?: string | null
    rehire?: boolean | null
    hiredBy?: string | null
  }

  // Validate rating range if provided
  if (rating !== undefined && rating != null && (rating < 1 || rating > 5 || !Number.isInteger(rating))) {
    return NextResponse.json({ error: 'rating must be an integer between 1 and 5' }, { status: 400 })
  }

  // Build update data — only include fields that were provided
  const updateData: Record<string, unknown> = {}
  if (courseName !== undefined) updateData.courseName = courseName.trim()
  if (status !== undefined) updateData.status = status
  if (startDate !== undefined) updateData.startDate = new Date(startDate + 'T12:00:00Z')
  if (endDate !== undefined) updateData.endDate = new Date(endDate + 'T12:00:00Z')
  if (startTime !== undefined) updateData.startTime = startTime
  if (endTime !== undefined) updateData.endTime = endTime
  if (location !== undefined) updateData.location = location
  if (rating !== undefined) updateData.rating = rating
  if (feedback !== undefined) updateData.feedback = feedback
  if (rehire !== undefined) updateData.rehire = rehire
  if (hiredBy !== undefined) updateData.hiredBy = hiredBy

  const engagement = await prisma.engagement.update({
    where: { id },
    data: updateData,
  })

  // Regenerate EngagementSchedule if date/time fields changed
  if (startDate !== undefined || endDate !== undefined || startTime !== undefined || endTime !== undefined) {
    await prisma.engagementSchedule.deleteMany({ where: { engagementId: id } })

    const updated = await prisma.engagement.findUnique({
      where: { id },
      select: { startDate: true, endDate: true, startTime: true, endTime: true, coachId: true },
    })
    if (updated) {
      const start = updated.startDate
      const end = updated.endDate
      const scheduleData: { engagementId: string; coachId: string; date: Date; startTime: string; endTime: string }[] = []
      const cursor = new Date(start)
      while (cursor <= end) {
        const dow = cursor.getUTCDay()
        if (dow >= 1 && dow <= 5) {
          scheduleData.push({
            engagementId: id,
            coachId: updated.coachId,
            date: new Date(cursor),
            startTime: updated.startTime || '09:00',
            endTime: updated.endTime || '18:00',
          })
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      }
      if (scheduleData.length > 0) {
        await prisma.engagementSchedule.createMany({ data: scheduleData })
      }
    }
  }

  await logChanges({
    tableName: 'engagements',
    recordId: id,
    action: 'update',
    oldData: existing,
    newData: updateData,
    changedBy: auth.manager.email,
  })

  return NextResponse.json(engagement)
}
