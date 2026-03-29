import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

// GET /api/master/fields — list all fields sorted by name
export async function GET() {
  const session = await requireManager()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const fields = await prisma.field.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })

  return NextResponse.json({ fields }, {
    headers: { 'Cache-Control': 'private, max-age=3600' },
  })
}

// POST /api/master/fields — create if not exists, return field
export async function POST(request: NextRequest) {
  const session = await requireManager()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { name } = body as { name?: string }

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const field = await prisma.field.upsert({
    where: { name: name.trim() },
    create: { name: name.trim() },
    update: {},
    select: { id: true, name: true },
  })

  return NextResponse.json({ field }, { status: 201 })
}
