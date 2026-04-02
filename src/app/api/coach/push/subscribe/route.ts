import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractToken, validateCoachToken } from '@/lib/coach-auth'

// POST /api/coach/push/subscribe — 코치 Push 구독 등록
export async function POST(request: NextRequest) {
  const token = extractToken(request)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const coach = await validateCoachToken(token)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { endpoint, keys } = (await request.json()) as {
    endpoint: string
    keys: { p256dh: string; auth: string }
  }

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }

  const sub = await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      coachId: coach.id,
    },
    update: {
      p256dh: keys.p256dh,
      auth: keys.auth,
      coachId: coach.id,
    },
  })

  return NextResponse.json({ id: sub.id })
}

// DELETE /api/coach/push/subscribe — 코치 Push 구독 해제
export async function DELETE(request: NextRequest) {
  const token = extractToken(request)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const coach = await validateCoachToken(token)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { endpoint } = (await request.json()) as { endpoint: string }
  if (!endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 })

  await prisma.pushSubscription.deleteMany({
    where: { endpoint, coachId: coach.id },
  })

  return NextResponse.json({ ok: true })
}
