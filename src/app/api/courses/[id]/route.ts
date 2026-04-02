import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

type RouteParams = { params: Promise<{ id: string }> }

// PATCH /api/courses/:id
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireManager()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const course = await prisma.course.findUnique({ where: { id } })
    if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (course.managerId !== auth.manager.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { name, startDate, endDate } = (await request.json()) as {
      name?: string
      startDate?: string | null
      endDate?: string | null
    }

    if (name !== undefined && (!name || !name.trim())) {
      return NextResponse.json({ error: '과정명을 입력해주세요' }, { status: 400 })
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
      },
    })

    return NextResponse.json(updated)
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
    if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (course.managerId !== auth.manager.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Detach scoutings before deleting
    await prisma.scouting.updateMany({
      where: { courseId: id },
      data: { courseId: null },
    })

    await prisma.course.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[DELETE /api/courses] Error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
