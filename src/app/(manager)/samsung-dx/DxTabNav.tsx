"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const TABS = [
  { href: "/samsung-dx/assignment", label: "배정" },
  { href: "/samsung-dx/coaches", label: "코치 목록" },
] as const

export default function DxTabNav() {
  const pathname = usePathname()

  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <nav className="flex gap-6">
          {TABS.map((tab) => {
            const active = pathname.startsWith(tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`border-b-2 py-3 text-sm font-medium transition-colors ${
                  active
                    ? "border-[#1976D2] text-[#1976D2]"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
