import { randomBytes } from 'crypto'
import { prisma } from './prisma'

export function generateAccessToken(): string {
  return randomBytes(32).toString('hex') // 64 characters
}

export async function validateCoachToken(token: string) {
  if (!token || token.length !== 64) return null

  const coach = await prisma.coach.findUnique({
    where: { accessToken: token },
    select: {
      id: true,
      name: true,
      status: true,
      deletedAt: true,
    },
  })

  if (!coach || coach.deletedAt) return null
  return { id: coach.id, name: coach.name, status: coach.status }
}

/**
 * Extract coach token from request.
 * Supports: Authorization: Bearer <token>, or ?token=<token> query param
 */
export function extractToken(request: Request): string | null {
  // Check Authorization header
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }

  // Check query parameter
  const url = new URL(request.url)
  return url.searchParams.get('token')
}
