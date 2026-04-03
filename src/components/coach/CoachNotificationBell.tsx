"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { usePushSubscription } from "@/hooks/usePushSubscription"

interface Notification {
  id: string
  type: string
  title: string
  body: string
  data: { clickUrl?: string } | null
  enriched?: { displayText?: string | null } | null
  readAt: string | null
  expired: boolean
  createdAt: string
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "방금"
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

export default function CoachNotificationBell({ token }: { token: string }) {
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const pushTriedRef = useRef(false)
  const router = useRouter()
  const { state: pushState, subscribed, subscribe } = usePushSubscription(`/api/coach/push/subscribe?token=${token}`)

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch(`/api/coach/notifications/unread-count?token=${token}`)
      if (res.ok) setCount((await res.json()).count)
    } catch { /* ignore */ }
  }, [token])

  useEffect(() => {
    fetchCount()
    const interval = setInterval(fetchCount, 30000)
    return () => clearInterval(interval)
  }, [fetchCount])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  async function handleOpen() {
    setOpen(!open)
    // Auto-request push permission on first click, or re-subscribe if granted but not subscribed
    if (!pushTriedRef.current && (pushState === "prompt" || (pushState === "granted" && !subscribed))) {
      pushTriedRef.current = true
      subscribe()
    }
    if (!open) {
      setLoading(true)
      try {
        const res = await fetch(`/api/coach/notifications?token=${token}`)
        if (res.ok) setNotifications((await res.json()).notifications || [])
      } catch { /* ignore */ }
      finally { setLoading(false) }
    }
  }

  async function handleClick(n: Notification) {
    if (!n.readAt) {
      await fetch(`/api/coach/notifications/${n.id}/read?token=${token}`, { method: "PATCH" })
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))
      )
      setCount((c) => Math.max(0, c - 1))
    }
    setOpen(false)
    if (n.data?.clickUrl) router.push(n.data.clickUrl)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        className="relative cursor-pointer rounded-md bg-white/20 p-1.5 text-white backdrop-blur-sm hover:bg-white/30 transition-colors"
        aria-label="알림"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && (
          <span
            className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white"
            title={`${count}개의 읽지 않은 알림`}
          />
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-2rem)] max-h-[360px] overflow-y-auto rounded-xl bg-white shadow-lg border border-gray-200 z-50">
          <div className="px-3 py-2.5 border-b border-gray-100">
            <span className="text-xs font-semibold text-[#333]">알림</span>
          </div>
          {loading ? (
            <div className="px-3 py-6 text-center text-xs text-gray-400">로딩 중...</div>
          ) : notifications.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-gray-400">알림이 없습니다</div>
          ) : (
            notifications.slice(0, 20).map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`group w-full text-left px-3 py-2.5 border-b border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer ${
                  !n.readAt ? "bg-blue-50/50" : ""
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold text-[#333]">{n.title}</div>
                    <div className="mt-0.5 text-[11px] text-gray-600 line-clamp-2">{n.enriched?.displayText || n.body}</div>
                    <div className="mt-0.5 text-[10px] text-gray-400">{timeAgo(n.createdAt)}</div>
                  </div>
                  <span className="shrink-0 text-gray-300 transition-colors group-hover:text-gray-500">›</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
