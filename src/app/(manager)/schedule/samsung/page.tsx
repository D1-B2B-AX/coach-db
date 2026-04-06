"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardContent from '../_components/DashboardContent'

export default function SamsungDashboardPage() {
  const router = useRouter()
  const [accessState, setAccessState] = useState<"checking" | "allowed" | "denied">("checking")

  useEffect(() => {
    async function checkAccess() {
      try {
        const res = await fetch('/api/auth/me')
        if (res.ok) {
          const data = await res.json()
          if (data.role === 'admin' || data.role === 'samsung_admin') {
            setAccessState("allowed")
          } else {
            setAccessState("denied")
          }
        } else {
          setAccessState("denied")
        }
      } catch {
        setAccessState("denied")
      }
    }
    checkAccess()
  }, [])

  useEffect(() => {
    if (accessState === "denied") {
      router.replace("/403")
    }
  }, [accessState, router])

  if (accessState === "checking") {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="py-12 text-center text-sm text-gray-400">권한을 확인하는 중...</div>
      </div>
    )
  }

  if (accessState === "denied") {
    return null
  }

  return <DashboardContent variant="samsung" />
}
