import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

const YM_RE = /^\d{4}-(?:0[1-9]|1[0-2])$/
const CHANNEL_KEYS = ['ext_open_chat', 'ext_slack', 'ext_albamon', 'ext_other'] as const

export async function POST(request: NextRequest) {
  const auth = await requireManager()
  if (!auth || auth.manager.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const body = await request.json()
  const { yearMonth, channels } = body as {
    yearMonth: string
    channels: Record<string, number>
  }

  if (!yearMonth || !YM_RE.test(yearMonth)) {
    return NextResponse.json({ error: 'yearMonth (YYYY-MM) is required' }, { status: 400 })
  }

  if (!channels || typeof channels !== 'object') {
    return NextResponse.json({ error: 'channels object is required' }, { status: 400 })
  }

  // Validate all channel keys are present and values are numbers
  for (const key of CHANNEL_KEYS) {
    if (typeof channels[key] !== 'number' || channels[key] < 0) {
      return NextResponse.json(
        { error: `channels.${key} must be a non-negative number` },
        { status: 400 },
      )
    }
  }

  // Upsert 4 records
  await Promise.all(
    CHANNEL_KEYS.map((key) =>
      prisma.metricSnapshot.upsert({
        where: { yearMonth_metricKey: { yearMonth, metricKey: key } },
        create: { yearMonth, metricKey: key, value: channels[key] },
        update: { value: channels[key] },
      }),
    ),
  )

  return NextResponse.json({ success: true })
}
