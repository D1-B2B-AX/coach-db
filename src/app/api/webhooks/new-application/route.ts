import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendSlack } from '@/lib/slack'

export async function POST(request: NextRequest) {
  const body = await request.json()

  // 시크릿 검증
  if (body.secret !== process.env.SYNC_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const name = String(body.name || '').trim()
  const phone = normalizePhone(body.phone)
  const email = String(body.email || '').trim() || null
  const affiliation = String(body.affiliation || '').trim() || null
  const workType = String(body.workType || '').trim() || null
  const fields = String(body.fields || '').trim() || null

  if (!name) {
    return NextResponse.json({ error: 'name required' }, { status: 400 })
  }

  // DB에서 코치 조회 (이름 + 연락처)
  const existing = await prisma.coach.findFirst({
    where: {
      name,
      phone,
      deletedAt: null,
      status: { not: 'pending' },
    },
    select: { id: true, status: true, workType: true },
  })

  const info = [phone, affiliation, fields].filter(Boolean).join(' · ')
  let message: string

  if (existing) {
    message = [
      `*코치 신청 알림*`,
      `• ${name} — ${info}`,
      `> 기존 코치 (DB 상태: ${existing.status})`,
    ].join('\n')
  } else {
    message = [
      `*코치 신청 알림*`,
      `• ${name} — ${info}`,
      `> 신규 코치 (DB에 없음)`,
    ].join('\n')
  }

  await sendSlack(message).catch(err => {
    console.error('[webhook] Slack failed:', err)
  })

  return NextResponse.json({ ok: true, isExisting: !!existing })
}

function normalizePhone(raw: string | null): string {
  if (!raw) return ''
  const digits = String(raw).replace(/[^\d]/g, '')
  if (digits.length >= 10) return digits.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3')
  return String(raw).trim()
}
