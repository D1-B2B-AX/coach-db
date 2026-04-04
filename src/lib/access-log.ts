import { prisma } from './prisma'
import { NextRequest } from 'next/server'

type Actor = {
  type: 'coach' | 'manager' | 'manager_as_viewer'
  id: string
  name: string
}

export function logAccess(request: NextRequest, actor: Actor, statusCode?: number) {
  const path = new URL(request.url).pathname
  const method = request.method
  const userAgent = request.headers.get('user-agent')
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')

  prisma.apiAccessLog.create({
    data: {
      path,
      method,
      actorType: actor.type,
      actorId: actor.id,
      actorName: actor.name,
      userAgent,
      ip,
      statusCode,
    },
  }).catch(() => {})
}
