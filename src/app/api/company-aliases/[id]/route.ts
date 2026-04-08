import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

// PATCH /api/company-aliases/[id] — 회사명 별칭 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireManager()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (auth.manager.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    let body: Record<string, unknown>
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
    const { companyName, alias } = body as { companyName?: string; alias?: string }

    if (!alias && !companyName) {
      return NextResponse.json({ error: 'alias or companyName required' }, { status: 400 })
    }

    const updated = await prisma.companyAlias.update({
      where: { id },
      data: {
        ...(companyName !== undefined && { companyName }),
        ...(alias !== undefined && { alias }),
      },
    })

    return NextResponse.json({ alias: updated })
  } catch (e) {
    if (
      e instanceof Error &&
      'code' in e &&
      (e as NodeJS.ErrnoException).code === 'P2025'
    ) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (
      e instanceof Error &&
      'code' in e &&
      (e as NodeJS.ErrnoException).code === 'P2002'
    ) {
      return NextResponse.json({ error: 'companyName already exists' }, { status: 409 })
    }
    console.error('[PATCH /api/company-aliases/[id]] Error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE /api/company-aliases/[id] — 회사명 별칭 삭제
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireManager()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (auth.manager.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    await prisma.companyAlias.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (e) {
    if (
      e instanceof Error &&
      'code' in e &&
      (e as NodeJS.ErrnoException).code === 'P2025'
    ) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    console.error('[DELETE /api/company-aliases/[id]] Error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
