import { redirect } from 'next/navigation'
import SamsungDsPrototype from '@/components/samsung-ds/SamsungDsPrototype'
import { requireManager } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export default async function SamsungDsPage() {
  const auth = await requireManager()

  if (!auth) {
    redirect('/login')
  }

  if (auth.manager.role !== 'admin' && auth.manager.role !== 'samsung_admin') {
    redirect('/403')
  }

  const coaches = await prisma.coach.findMany({
    where: {
      deletedAt: null,
      status: { not: 'pending' },
      workType: { contains: '삼전 DS' },
    },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })

  return <SamsungDsPrototype coaches={coaches} />
}
