import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  const auth = await requireManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let hiredByName = auth.manager.name
  const qManagerId = request.nextUrl.searchParams.get('managerId')
  if (qManagerId && auth.manager.role === 'admin') {
    const target = await prisma.manager.findUnique({ where: { id: qManagerId }, select: { name: true } })
    if (target) hiredByName = target.name
  }

  const engagements = await prisma.engagement.findMany({
    where: { hiredBy: hiredByName },
    include: {
      coach: {
        select: { id: true, name: true, employeeId: true, phone: true, email: true },
      },
    },
    orderBy: { startDate: 'desc' },
  })

  return NextResponse.json({ engagements })
}
