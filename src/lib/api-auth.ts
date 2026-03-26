import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function requireManager() {
  const session = await auth()
  if (!session?.user?.email) {
    return null
  }

  const manager = await prisma.manager.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, name: true, role: true },
  })

  if (!manager || manager.role === 'blocked') return null

  return { session, manager }
}
