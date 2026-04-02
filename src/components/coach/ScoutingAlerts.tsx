"use client"

import { useState, useEffect, useCallback } from "react"

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
  readAt: string | null
  expired: boolean
  expiredAt: string | null
  createdAt: string
}

export default function ScoutingAlerts({ token }: { token: string }) {
  const [alerts, setAlerts] = useState<ScoutingNotification[]>([])
  const [acting, setActing] = useState<string | null>(null)

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
        // 알림 읽음 처리
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

  if (pendingAlerts.length === 0 && alerts.filter((a) => a.expired).length === 0) {
    return null
  }

  return (
    <div className="space-y-2 mb-4">
      {pendingAlerts.map((a) => (
        <div
          key={a.id}
          className="rounded-xl border border-[#FFE0B2] bg-[#FFF8E1] px-4 py-3"
        >
          <div className="text-sm text-[#333] mb-2">{a.body}</div>
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
      ))}
      {alerts
        .filter((a) => a.expired)
        .map((a) => (
          <div
            key={a.id}
            className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 opacity-60"
          >
            <div className="text-sm text-gray-500 line-through">{a.body}</div>
            <div className="text-xs text-gray-400 mt-1">매니저가 섭외를 취소했습니다</div>
          </div>
        ))}
    </div>
  )
}
