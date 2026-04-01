import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

// POST /api/push/subscribe — 매니저 Push 구독 등록
export async function POST(request: NextRequest) {
  const auth = await requireManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
      managerId: auth.manager.id,
    },
    update: {
      p256dh: keys.p256dh,
      auth: keys.auth,
      managerId: auth.manager.id,
    },
  })

  return NextResponse.json({ id: sub.id })
}

// DELETE /api/push/subscribe — 매니저 Push 구독 해제
export async function DELETE(request: NextRequest) {
  const auth = await requireManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { endpoint } = (await request.json()) as { endpoint: string }
  if (!endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 })

  await prisma.pushSubscription.deleteMany({
    where: { endpoint, managerId: auth.manager.id },
  })

  return NextResponse.json({ ok: true })
}
