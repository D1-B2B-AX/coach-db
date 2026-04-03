import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

// GET /api/courses?managerId=...
export async function GET(request: NextRequest) {
  try {
    const auth = await requireManager()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const courses = await prisma.course.findMany({
      where: { managerId: auth.manager.id },
      include: {
        _count: { select: { scoutings: true } },
        scoutings: {
          select: { status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const result = courses.map((c) => {
      const statusCounts: Record<string, number> = {}
      for (const s of c.scoutings) {
        statusCounts[s.status] = (statusCounts[s.status] || 0) + 1
      }
      return {
        id: c.id,
        name: c.name,
        description: c.description,
        managerId: c.managerId,
        startDate: c.startDate,
        endDate: c.endDate,
        workHours: c.workHours,
        location: c.location,
        hourlyRate: c.hourlyRate,
        createdAt: c.createdAt,
        scoutingCount: c._count.scoutings,
        statusCounts,
      }
    })

    return NextResponse.json({ courses: result })
  } catch (e) {
    console.error('[GET /api/courses] Error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/courses
export async function POST(request: NextRequest) {
  try {
    const auth = await requireManager()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { name, startDate, endDate, description, workHours, location, hourlyRate } = (await request.json()) as {
      name: string
      startDate?: string
      endDate?: string
      description?: string | null
      workHours?: string | null
      location?: string | null
      hourlyRate?: number | string | null
    }

    if (!name || !name.trim()) {
      return NextResponse.json({ error: '과정명을 입력해주세요' }, { status: 400 })
    }
    if (name.trim().length > 200) {
      return NextResponse.json({ error: '과정명은 200자 이내여야 합니다' }, { status: 400 })
    }

    const trimmedWorkHours = workHours?.trim() || null
    const trimmedLocation = location?.trim() || null
    const parsedHourlyRate = hourlyRate === undefined || hourlyRate === null || hourlyRate === ""
      ? null
      : Number(hourlyRate)

    if (parsedHourlyRate !== null && (!Number.isFinite(parsedHourlyRate) || parsedHourlyRate < 0)) {
      return NextResponse.json({ error: '시급은 0 이상의 숫자여야 합니다' }, { status: 400 })
    }

    if (endDate && !startDate) {
      return NextResponse.json({ error: '시작일 없이 종료일만 입력할 수 없습니다' }, { status: 400 })
    }
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      return NextResponse.json({ error: '종료일은 시작일 이후여야 합니다' }, { status: 400 })
    }

    const course = await prisma.course.create({
      data: {
        name: name.trim(),
        managerId: auth.manager.id,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        description: description?.trim() || null,
        workHours: trimmedWorkHours,
        location: trimmedLocation,
        hourlyRate: parsedHourlyRate,
      },
    })

    return NextResponse.json(course, { status: 201 })
  } catch (e) {
    console.error('[POST /api/courses] Error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
