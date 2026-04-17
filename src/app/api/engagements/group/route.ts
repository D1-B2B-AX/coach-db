import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

// PATCH /api/engagements/group
// body: { coachId, courseName, location?, hourlyRate?, description?, remarks? }
// 동일 (coachId, courseName) 엔게이지먼트 전체에 공통 필드 적용
export async function PATCH(request: NextRequest) {
  const auth = await requireManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { coachId, courseName, location, hourlyRate, description, remarks } = body as {
    coachId?: string
    courseName?: string
    location?: string | null
    hourlyRate?: number | string | null
    description?: string | null
    remarks?: string | null
  }

  if (!coachId || !courseName) {
    return NextResponse.json({ error: 'coachId와 courseName이 필요합니다' }, { status: 400 })
  }

  const targets = await prisma.engagement.findMany({
    where: { coachId, courseName },
    select: { id: true, hiredBy: true },
  })

  if (targets.length === 0) {
    return NextResponse.json({ error: '해당 투입 이력이 없습니다' }, { status: 404 })
  }

  const isAdmin = auth.manager.role === 'admin'
  const unauthorized = targets.some((e) => !isAdmin && e.hiredBy && e.hiredBy !== auth.manager.name)
  if (unauthorized) {
    return NextResponse.json({ error: '담당 매니저만 수정할 수 있습니다' }, { status: 403 })
  }

  const parsedHourlyRate = hourlyRate !== undefined
    ? (hourlyRate === null || hourlyRate === '' ? null : Number(hourlyRate))
    : undefined
  if (parsedHourlyRate !== undefined && parsedHourlyRate !== null && (!Number.isFinite(parsedHourlyRate) || parsedHourlyRate < 0)) {
    return NextResponse.json({ error: '시급은 0 이상의 숫자여야 합니다' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (location !== undefined) data.location = location && String(location).trim() ? String(location).trim() : null
  if (parsedHourlyRate !== undefined) data.hourlyRate = parsedHourlyRate
  if (description !== undefined) data.description = description && String(description).trim() ? String(description).trim() : null
  if (remarks !== undefined) data.remarks = remarks && String(remarks).trim() ? String(remarks).trim() : null

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: '변경할 필드가 없습니다' }, { status: 400 })
  }

  await prisma.engagement.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data,
  })

  return NextResponse.json({ updated: targets.length })
}
