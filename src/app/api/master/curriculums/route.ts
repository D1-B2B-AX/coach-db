import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

// GET /api/master/curriculums — list all curriculums sorted by name
export async function GET() {
  const session = await requireManager()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const curriculums = await prisma.curriculum.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })

  return NextResponse.json({ curriculums }, {
    headers: { 'Cache-Control': 'private, max-age=3600' },
  })
}

// POST /api/master/curriculums — create if not exists, return curriculum
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

  const curriculum = await prisma.curriculum.upsert({
    where: { name: name.trim() },
    create: { name: name.trim() },
    update: {},
    select: { id: true, name: true },
  })

  return NextResponse.json({ curriculum }, { status: 201 })
}
