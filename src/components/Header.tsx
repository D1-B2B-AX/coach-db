"use client"

import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import NotificationBell from './NotificationBell'

const isStaging = process.env.NEXT_PUBLIC_ENV === 'staging'


function HeaderContent() {
  const { data: session } = useSession()
  const pathname = usePathname()
  const searchParamsObj = useSearchParams()
  const searchParams = searchParamsObj.get("tab")
  const [managerRole, setManagerRole] = useState<string | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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

  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const mobileMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false)
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) setMobileMenuOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // 페이지 이동 시 모바일 메뉴 닫기
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname, searchParams])

  const navItems = useMemo(() => {
    const items: Array<{
      href: string
      label: string
      active: boolean
      roles?: readonly string[]
    }> = [
      { href: "/dashboard", label: "일정", active: pathname === "/dashboard" },
      { href: "/coaches", label: "코치 목록", active: pathname.startsWith("/coaches") },
      { href: "/mypage?tab=scoutings", label: "찜꽁스테이지", active: pathname === "/mypage" && (!searchParams || searchParams === "scoutings") },
      { href: "/mypage?tab=courses", label: "나의 과정", active: pathname === "/mypage" && searchParams === "courses" },
      // TEMP: 스크린샷용 숨김
      // {
      //   href: "/dashboard/samsung",
      //   label: "삼전 전용",
      //   active: pathname === "/dashboard/samsung",
      //   roles: ["admin", "samsung_admin"] as const,
      // },
      // {
      //   href: "/admin",
      //   label: "관리자페이지",
      //   active: pathname.startsWith("/admin"),
      //   roles: ["admin"] as const,
      // },
    ]

    return items.filter((item) => {
      if (!item.roles) return true
      if (!managerRole) return false
      return item.roles.includes(managerRole)
    })
  }, [managerRole, pathname, searchParams])

  return (
    <header className={isStaging ? "bg-[#FFF8E1] border-b border-[#FFE082]" : "bg-white border-b border-gray-100"}>
      <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-12 sm:h-14">
          {/* Left: hamburger (mobile) + logo + nav (desktop) */}
          <div className="flex items-center gap-2 sm:gap-6 min-w-0">
            <div ref={mobileMenuRef} className="relative md:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="cursor-pointer flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
              >
                <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
                  <path d="M1 1h16M1 7h16M1 13h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              {mobileMenuOpen && (
                <div className="absolute left-0 top-full mt-1 w-48 rounded-xl bg-white shadow-lg border border-gray-200 z-50 py-1">
                  {navItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`block px-4 py-2.5 text-sm font-medium transition-colors ${
                        item.active
                          ? "bg-[#EBF2FA] text-[#1565C0]"
                          : "text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <Link href="/dashboard" className="shrink-0">
              <img src="/title.png" alt="코치 DB" className="h-5 sm:h-7" />
            </Link>
            <nav className="hidden md:flex shrink-0 gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
                    item.active
                      ? item.href === "/dashboard/samsung"
                        ? "bg-[#FFF3E0] text-[#E65100]"
                        : "bg-[#EBF2FA] text-[#1565C0]"
                      : item.href === "/dashboard/samsung"
                        ? "text-gray-500 hover:bg-gray-50 hover:text-[#E65100]"
                        : "text-gray-500 hover:bg-gray-50 hover:text-[#1565C0]"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          {/* Right: notifications + user */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <NotificationBell />
            <div ref={userMenuRef} className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex cursor-pointer items-center gap-2 text-sm text-gray-500 transition-colors hover:text-[#1565C0]"
              >
                <span>{session?.user?.name || session?.user?.email}</span>
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-32 rounded-lg bg-white shadow-lg border border-gray-200 z-50 py-1">
                  <button
                    onClick={() => { setUserMenuOpen(false); signOut({ callbackUrl: '/login' }) }}
                    className="w-full cursor-pointer text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    로그아웃
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

function HeaderFallback() {
  return (
    <header className={isStaging ? "bg-[#FFF8E1] border-b border-[#FFE082]" : "bg-white border-b border-gray-100"}>
      <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="h-12 sm:h-14" />
      </div>
    </header>
  )
}

export default function Header() {
  return (
    <Suspense fallback={<HeaderFallback />}>
      <HeaderContent />
    </Suspense>
  )
}
