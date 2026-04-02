import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

// GET /api/company-aliases — 회사명 별칭 목록
export async function GET() {
  try {
    const auth = await requireManager()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (auth.manager.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const aliases = await prisma.companyAlias.findMany({
      orderBy: { companyName: 'asc' },
    })

    return NextResponse.json({ aliases })
  } catch (e) {
    console.error('[GET /api/company-aliases] Error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/company-aliases — 회사명 별칭 생성
export async function POST(request: NextRequest) {
  try {
    const auth = await requireManager()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (auth.manager.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { companyName, alias } = (await request.json()) as {
      companyName: string
      alias: string
    }

    if (!companyName || !alias) {
      return NextResponse.json({ error: 'companyName and alias required' }, { status: 400 })
    }

    const created = await prisma.companyAlias.create({
      data: { companyName, alias },
    })

    return NextResponse.json({ alias: created }, { status: 201 })
  } catch (e) {
    if (
      e instanceof Error &&
      'code' in e &&
      (e as NodeJS.ErrnoException).code === 'P2002'
    ) {
      return NextResponse.json({ error: 'companyName already exists' }, { status: 409 })
    }
    console.error('[POST /api/company-aliases] Error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
