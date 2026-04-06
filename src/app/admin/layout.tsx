import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { SessionProvider } from '@/components/SessionProvider'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user?.email) {
    redirect('/login')
  }

  const manager = await prisma.manager.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  })

  if (!manager || manager.role !== 'admin') {
    redirect('/dashboard')
  }

  return (
    <SessionProvider>
      <div className="min-h-screen bg-gray-50">
        <main>{children}</main>
      </div>
    </SessionProvider>
  )
}
