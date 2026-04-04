"use client"

import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState, useRef } from 'react'
import NotificationBell from './NotificationBell'

const isStaging = process.env.NEXT_PUBLIC_ENV === 'staging'


export default function Header() {
  const { data: session } = useSession()
  const pathname = usePathname()
  const searchParamsObj = useSearchParams()
  const searchParams = searchParamsObj.get("tab")
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

  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const navItems = useMemo(() => {
    const items: Array<{
      href: string
      label: string
      active: boolean
      roles?: readonly string[]
    }> = [
      { href: "/dashboard", label: "대시보드", active: pathname === "/dashboard" },
      { href: "/mypage?tab=scoutings", label: "찜꽁스테이지", active: pathname === "/mypage" && (!searchParams || searchParams === "scoutings") },
      { href: "/mypage?tab=courses", label: "과정관리", active: pathname === "/mypage" && searchParams === "courses" },
      { href: "/coaches", label: "코치풀", active: pathname.startsWith("/coaches") },
      {
        href: "/dashboard/samsung",
        label: "삼전",
        active: pathname === "/dashboard/samsung",
        roles: ["admin", "samsung_admin"] as const,
      },
      {
        href: "/admin",
        label: "관리자",
        active: pathname.startsWith("/admin"),
        roles: ["admin"] as const,
      },
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
          {/* Left: logo + nav */}
          <div className="flex items-center gap-2 sm:gap-6 min-w-0">
            <Link href="/dashboard" className="shrink-0">
              <img src="/title.png" alt="코치 DB" className="h-5 sm:h-7" />
            </Link>
            <nav className="flex shrink-0 gap-1">
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
