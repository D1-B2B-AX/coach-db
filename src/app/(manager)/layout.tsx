import Header from '@/components/Header'
import { SessionProvider } from '@/components/SessionProvider'

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main>{children}</main>
      </div>
    </SessionProvider>
  )
}
