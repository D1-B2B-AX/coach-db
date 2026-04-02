import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

// GET /api/admin/managers — list all managers
export async function GET() {
  const auth = await requireManager()
  if (!auth || auth.manager.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const managers = await prisma.manager.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  })

  return NextResponse.json({ managers })
}

// PUT /api/admin/managers — update role
export async function PUT(request: NextRequest) {
  const auth = await requireManager()
  if (!auth || auth.manager.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { id, role } = (await request.json()) as { id: string; role: string }

  if (!['admin', 'samsung_admin', 'user', 'blocked'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  // Prevent self-demotion
  if (id === auth.manager.id && role !== 'admin') {
    return NextResponse.json({ error: '본인의 admin 권한은 해제할 수 없습니다' }, { status: 400 })
  }

  const updated = await prisma.manager.update({
    where: { id },
    data: { role: role as 'admin' | 'samsung_admin' | 'user' | 'blocked' },
    select: { id: true, email: true, name: true, role: true },
  })

  return NextResponse.json(updated)
}
