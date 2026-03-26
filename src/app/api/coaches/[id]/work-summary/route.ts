import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'
import { toDateOnly } from '@/lib/date-utils'

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/coaches/:id/work-summary?months=6
// Returns per-month work day counts and individual dates for recent months
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await requireManager()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const { searchParams } = new URL(request.url)
  const months = Math.min(12, Math.max(1, parseInt(searchParams.get('months') || '6', 10)))

  const coach = await prisma.coach.findUnique({
    where: { id, deletedAt: null },
    select: { id: true },
  })
  if (!coach) {
    return NextResponse.json({ error: 'Coach not found' }, { status: 404 })
  }

  const now = new Date()
  const sm = now.getMonth() - months + 2 // 1-based
  const sy = now.getFullYear() + Math.floor((sm - 1) / 12)
  const smAdj = ((sm - 1) % 12 + 12) % 12 + 1
  const startDate = toDateOnly(`${sy}-${String(smAdj).padStart(2, '0')}-01`)
  const td = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const endDate = toDateOnly(td)

  const schedules = await prisma.engagementSchedule.findMany({
    where: {
      coachId: id,
      date: { gte: startDate, lte: endDate },
    },
    select: {
      date: true,
      startTime: true,
      endTime: true,
    },
    orderBy: { date: 'asc' },
  })

  // Group by month
  const monthMap = new Map<string, Set<string>>()
  const dateDetails = new Map<string, { startTime: string; endTime: string }[]>()

  for (const s of schedules) {
    const dateStr = s.date.toISOString().split('T')[0]
    const ym = dateStr.slice(0, 7)

    if (!monthMap.has(ym)) monthMap.set(ym, new Set())
    monthMap.get(ym)!.add(dateStr)

    if (!dateDetails.has(dateStr)) dateDetails.set(dateStr, [])
    dateDetails.get(dateStr)!.push({ startTime: s.startTime, endTime: s.endTime })
  }

  // Build monthly summary
  const monthlySummary: { yearMonth: string; workDays: number; dates: string[] }[] = []
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const dates = monthMap.get(ym) || new Set()
    monthlySummary.push({
      yearMonth: ym,
      workDays: dates.size,
      dates: [...dates].sort(),
    })
  }

  const totalWorkDays = monthlySummary.reduce((sum, m) => sum + m.workDays, 0)

  return NextResponse.json({
    totalWorkDays,
    months: monthlySummary,
  })
}
