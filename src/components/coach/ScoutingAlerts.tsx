"use client"

import { useState, useEffect, useCallback } from "react"
import React from "react"

const OPEN_SCOUTING_ALERTS_EVENT = "coach:open-scouting-alerts"
const SCOUTING_ALERTS_COUNT_EVENT = "coach:scouting-alerts-count"

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
  const [forcedVisible, setForcedVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)')
    setIsMobile(!mql.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(!e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch(
        `/api/coach/notifications?token=${token}&type=scouting_request&pendingOnly=true`,
        { cache: "no-store" }
      )
      if (res.ok) {
        const data = await res.json()
        setAlerts(
          (data.notifications || []).filter(
            (n: ScoutingNotification) => n.type === "scouting_request"
          )
        )
      } else {
        setAlerts([])
        setLoadError(true)
      }
    } catch {
      setAlerts([])
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    const initialFetch = window.setTimeout(() => {
      void fetchAlerts()
    }, 0)
    const interval = window.setInterval(() => {
      void fetchAlerts()
    }, 30000)
    return () => {
      window.clearTimeout(initialFetch)
      window.clearInterval(interval)
    }
  }, [fetchAlerts])

  useEffect(() => {
    const handleOpen = () => {
      setForcedVisible(true)
      setExpanded(true)
      void fetchAlerts()
    }
    window.addEventListener(OPEN_SCOUTING_ALERTS_EVENT, handleOpen)
    return () => window.removeEventListener(OPEN_SCOUTING_ALERTS_EVENT, handleOpen)
  }, [fetchAlerts])

  const pendingAlerts = alerts.filter((a) => !a.readAt && !a.expired)
  const shouldRender = pendingAlerts.length > 0 || forcedVisible

  const limit = isMobile ? 2 : 3
  const visibleAlerts = expanded ? pendingAlerts : pendingAlerts.slice(0, limit)
  const hasMore = pendingAlerts.length > limit

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(SCOUTING_ALERTS_COUNT_EVENT, {
        detail: { count: pendingAlerts.length },
      })
    )
  }, [pendingAlerts.length])

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

  if (!shouldRender) return null

  return (
    <div className="w-full overflow-hidden rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
      <div className="px-7 pt-5 pb-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-[#333]">받은 요청</h3>
          <span className="rounded-full bg-[#E3F2FD] px-2 py-0.5 text-[12px] font-semibold text-[#1976D2]">
            {pendingAlerts.length}건
          </span>
        </div>
        <div className="space-y-2">
          {loading && pendingAlerts.length === 0 && (
            <div className="rounded-xl border border-[#E3F2FD] bg-[#F7FBFF] px-4 py-3 text-sm text-[#546E7A]">
              요청을 불러오는 중입니다...
            </div>
          )}
          {!loading && loadError && (
            <div className="rounded-xl border border-[#FFE0B2] bg-[#FFF8E1] px-4 py-3 text-sm text-[#8D6E63]">
              요청을 불러오지 못했습니다. 다시 시도해주세요.
            </div>
          )}
          {!loading && !loadError && pendingAlerts.length === 0 && (
            <div className="rounded-xl border border-[#ECEFF1] bg-[#FAFAFA] px-4 py-3 text-sm text-[#78909C]">
              현재 확인할 요청이 없습니다.
            </div>
          )}
          {visibleAlerts.map((a, i) => {
            const prevDate = i > 0 ? visibleAlerts[i - 1].data?.date : null
            const currentDate = a.data?.date
            const showDateHeader = currentDate && currentDate !== prevDate
            return (
              <React.Fragment key={a.id}>
                {showDateHeader && (
                  <div className="px-1 pt-1 text-[10px] font-medium text-gray-400">
                    {formatAlertDate(currentDate)}
                  </div>
                )}
                <div className="rounded-xl border border-[#E3F2FD] bg-[#F7FBFF] px-4 py-3">
                  <div className="mb-2 text-sm text-[#333]">{a.enriched?.displayText || a.body}</div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleAction(a, "accept")}
                      disabled={acting === a.id}
                      className="cursor-pointer rounded-full bg-[#1976D2] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#1565C0] disabled:opacity-50"
                    >
                      {acting === a.id ? "..." : "수락"}
                    </button>
                    <button
                      onClick={() => handleAction(a, "reject")}
                      disabled={acting === a.id}
                      className="cursor-pointer rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-50"
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
              className="w-full py-2 text-center text-xs font-medium text-[#1976D2] hover:text-[#1565C0]"
            >
              더보기 ({pendingAlerts.length - limit}건)
            </button>
          )}
          {forcedVisible && (
            <button
              onClick={() => void fetchAlerts()}
              className="w-full py-1 text-center text-[11px] text-gray-400 hover:text-gray-600"
            >
              새로고침
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
