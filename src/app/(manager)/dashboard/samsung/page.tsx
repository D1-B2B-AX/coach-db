"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardContent from '../_components/DashboardContent'

export default function SamsungDashboardPage() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState<boolean | null>(null)

  useEffect(() => {
    async function checkAccess() {
      try {
        const res = await fetch('/api/auth/me')
        if (res.ok) {
          const data = await res.json()
          if (data.role === 'admin' || data.role === 'samsung_admin') {
            setAuthorized(true)
          } else {
            router.replace('/dashboard')
          }
        } else {
          router.replace('/dashboard')
        }
      } catch {
        router.replace('/dashboard')
      }
    }
    checkAccess()
  }, [router])

  if (!authorized) return null

  return <DashboardContent variant="samsung" />
}
