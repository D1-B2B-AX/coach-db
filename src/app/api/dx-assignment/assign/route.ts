import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/api-auth'

// POST /api/dx-assignment/assign
export async function POST(request: NextRequest) {
  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { trackName, date, coachId } = body as {
    trackName?: string
    date?: string
    coachId?: string
  }

  if (!trackName || !date || !coachId) {
    return NextResponse.json({ error: 'trackName, date, coachId are required' }, { status: 400 })
  }

  const targetDate = new Date(date + 'T12:00:00Z')
  if (isNaN(targetDate.getTime())) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }

  // Check: max 2 coaches per track+date
  const trackCount = await prisma.dxAssignment.count({
    where: { trackName, date: targetDate },
  })
  if (trackCount >= 2) {
    return NextResponse.json({ error: '반당 최대 2명' }, { status: 400 })
  }

  // Create assignment (DB unique constraints enforce 1 coach per date)
  try {
    const assignment = await prisma.dxAssignment.create({
      data: {
        trackName,
        date: targetDate,
        coachId,
        assignedBy: session.manager.email,
        isAuto: false,
      },
    })

    return NextResponse.json({
      assignment: {
        id: assignment.id,
        trackName: assignment.trackName,
        date: assignment.date.toISOString().slice(0, 10),
        coachId: assignment.coachId,
        assignedBy: assignment.assignedBy,
        isAuto: assignment.isAuto,
      },
    })
  } catch (err: any) {
    // Prisma unique constraint violation
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: '하루 1반 제한' }, { status: 400 })
    }
    throw err
  }
}

// DELETE /api/dx-assignment/assign
export async function DELETE(request: NextRequest) {
  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { trackName, date, coachId } = body as {
    trackName?: string
    date?: string
    coachId?: string
  }

  if (!trackName || !date || !coachId) {
    return NextResponse.json({ error: 'trackName, date, coachId are required' }, { status: 400 })
  }

  const targetDate = new Date(date + 'T12:00:00Z')
  if (isNaN(targetDate.getTime())) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }

  const existing = await prisma.dxAssignment.findFirst({
    where: { trackName, date: targetDate, coachId },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
  }

  await prisma.dxAssignment.delete({ where: { id: existing.id } })

  return NextResponse.json({ deleted: true })
}
