import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

// POST /api/admin/metrics/external-hire
export async function POST(request: NextRequest) {
  const auth = await requireManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { yearMonth: string; channels: Record<string, number> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { yearMonth, channels } = body
  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json({ error: 'yearMonth must be YYYY-MM format' }, { status: 400 })
  }
  if (!channels || typeof channels !== 'object') {
    return NextResponse.json({ error: 'channels must be an object' }, { status: 400 })
  }

  const allowedKeys = ['ext_open_chat', 'ext_slack', 'ext_albamon', 'ext_other']
  const entries = Object.entries(channels).filter(([key]) => allowedKeys.includes(key))

  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.metricSnapshot.upsert({
        where: { yearMonth_metricKey: { yearMonth, metricKey: key } },
        update: { value: Math.max(0, Math.round(value)) },
        create: { yearMonth, metricKey: key, value: Math.max(0, Math.round(value)) },
      }),
    ),
  )

  return NextResponse.json({ success: true, updated: entries.length })
}
