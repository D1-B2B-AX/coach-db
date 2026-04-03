"use client"

import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import NotificationBell from './NotificationBell'

const isStaging = process.env.NEXT_PUBLIC_ENV === 'staging'

export default function Header() {
  const { data: session } = useSession()
  const pathname = usePathname()
  const [managerRole, setManagerRole] = useState<string | null>(null)

  useEffect(() => {
    async function fetchRole() {
      try {
        const res = await fetch("/api/auth/me")
        if (res.ok) {
          const data = await res.json()
          setManagerRole(data.role)
        }
      } catch {
        setManagerRole(null)
      }
    }
    if (session) fetchRole()
  }, [session])

  const isAdmin = managerRole === 'admin'
  const hasSamsungAccess = managerRole === 'admin' || managerRole === 'samsung_admin'

  return (
    <header className={isStaging ? "bg-[#FFF8E1] border-b border-[#FFE082]" : "bg-white border-b border-gray-100"}>
      <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-12 sm:h-14">
          {/* Left: logo + nav */}
          <div className="flex items-center gap-2 sm:gap-6 min-w-0">
            <Link href="/dashboard" className="shrink-0">
              <img src="/title.png" alt="코치 DB" className="h-5 sm:h-7" />
            </Link>
            <nav className="flex shrink-0 gap-1">
              <Link
                href="/dashboard"
                className={`whitespace-nowrap px-2.5 py-1.5 rounded-lg text-sm sm:text-sm font-medium transition-colors ${
                  pathname === '/dashboard'
                    ? 'bg-[#EBF2FA] text-[#1565C0]'
                    : 'text-gray-500 hover:text-[#1565C0] hover:bg-gray-50'
                }`}
              >
                대시보드
              </Link>
              {hasSamsungAccess && (
                <Link
                  href="/dashboard/samsung"
                  className={`whitespace-nowrap px-2.5 py-1.5 rounded-lg text-sm sm:text-sm font-medium transition-colors ${
                    pathname === '/dashboard/samsung'
                      ? 'bg-[#FFF3E0] text-[#E65100]'
                      : 'text-gray-500 hover:text-[#E65100] hover:bg-gray-50'
                  }`}
                >
                  삼전 대시보드
                </Link>
              )}
              <Link
                href="/coaches"
                className={`whitespace-nowrap px-2.5 py-1.5 rounded-lg text-sm sm:text-sm font-medium transition-colors ${
                  pathname.startsWith('/coaches')
                    ? 'bg-[#EBF2FA] text-[#1565C0]'
                    : 'text-gray-500 hover:text-[#1565C0] hover:bg-gray-50'
                }`}
              >
                전체 코치
              </Link>
              {isAdmin && (
                <Link
                  href="/admin"
                  className={`whitespace-nowrap px-2.5 py-1.5 rounded-lg text-sm sm:text-sm font-medium transition-colors ${
                    pathname.startsWith('/admin')
                      ? 'bg-[#EBF2FA] text-[#1565C0]'
                      : 'text-gray-500 hover:text-[#1565C0] hover:bg-gray-50'
                  }`}
                >
                  관리자
                </Link>
              )}
            </nav>
          </div>
          {/* Right: notifications + user */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <NotificationBell />
            <Link
              href="/mypage"
              className={`whitespace-nowrap px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === '/mypage'
                  ? 'bg-[#EBF2FA] text-[#1565C0]'
                  : 'text-gray-500 hover:text-[#1565C0] hover:bg-gray-50'
              }`}
            >
              요청 내역
            </Link>
            <span className="text-sm text-gray-400">{session?.user?.name || session?.user?.email}</span>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              로그아웃
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
