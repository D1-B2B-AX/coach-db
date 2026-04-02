"use client"

import { useState, useEffect, useCallback } from "react"
import React from "react"

interface ScoutingNotification {
  id: string
  type: string
  body: string
  data: {
    scoutingId?: string
    managerName?: string
    date?: string
    courseName?: string
    clickUrl?: string
  } | null
  enriched?: { displayText?: string | null } | null
  readAt: string | null
  expired: boolean
  expiredAt: string | null
  createdAt: string
}

function formatAlertDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export default function ScoutingAlerts({ token }: { token: string }) {
  const [alerts, setAlerts] = useState<ScoutingNotification[]>([])
  const [acting, setActing] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)')
    setIsMobile(!mql.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(!e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch(`/api/coach/notifications?token=${token}`)
      if (res.ok) {
        const data = await res.json()
        setAlerts(
          (data.notifications || []).filter(
            (n: ScoutingNotification) => n.type === "scouting_request"
          )
        )
      }
    } catch { /* ignore */ }
  }, [token])

  useEffect(() => {
    fetchAlerts()
    const interval = setInterval(fetchAlerts, 30000)
    return () => clearInterval(interval)
  }, [fetchAlerts])

  const pendingAlerts = alerts.filter((a) => !a.readAt && !a.expired)

  const limit = isMobile ? 2 : 3
  const visibleAlerts = expanded ? pendingAlerts : pendingAlerts.slice(0, limit)
  const hasMore = pendingAlerts.length > limit

  async function handleAction(alert: ScoutingNotification, action: "accept" | "reject") {
    if (!alert.data?.scoutingId) return

    if (action === "reject") {
      if (!confirm("정말 거절하시겠습니까?")) return
    }

    setActing(alert.id)
    try {
      const res = await fetch(`/api/coach/scoutings/${alert.data.scoutingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action }),
      })

      if (res.ok) {
        await fetch(`/api/coach/notifications/${alert.id}/read?token=${token}`, {
          method: "PATCH",
        })
        setAlerts((prev) => prev.filter((a) => a.id !== alert.id))
      } else if (res.status === 409) {
        window.alert("이 섭외는 매니저에 의해 취소되었습니다.")
        fetchAlerts()
      }
    } catch { /* ignore */ }
    finally { setActing(null) }
  }

  if (pendingAlerts.length === 0) return null

  return (
    <div className="space-y-2 mb-4">
      <div className="text-sm font-semibold text-[#333] px-1 mb-1">받은 요청 ({pendingAlerts.length})</div>
      {visibleAlerts.map((a, i) => {
        const prevDate = i > 0 ? visibleAlerts[i - 1].data?.date : null
        const currentDate = a.data?.date
        const showDateHeader = currentDate && currentDate !== prevDate
        return (
          <React.Fragment key={a.id}>
            {showDateHeader && (
              <div className="text-[10px] text-gray-400 font-medium px-1 pt-1">
                {formatAlertDate(currentDate)}
              </div>
            )}
            <div className="rounded-xl border border-[#FFE0B2] bg-[#FFF8E1] px-4 py-3">
              <div className="text-sm text-[#333] mb-2">{a.enriched?.displayText || a.body}</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleAction(a, "accept")}
                  disabled={acting === a.id}
                  className="cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium bg-[#388E3C] text-white hover:bg-[#2E7D32] transition-colors disabled:opacity-50"
                >
                  {acting === a.id ? "..." : "수락"}
                </button>
                <button
                  onClick={() => handleAction(a, "reject")}
                  disabled={acting === a.id}
                  className="cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  거절
                </button>
              </div>
            </div>
          </React.Fragment>
        )
      })}
      {hasMore && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full text-center py-2 text-xs text-[#F57C00] hover:text-[#E65100] font-medium"
        >
          더보기 ({pendingAlerts.length - limit}건)
        </button>
      )}
    </div>
  )
}
