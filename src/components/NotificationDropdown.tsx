"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

interface Notification {
  id: string
  type: string
  title: string
  body: string
  data: { clickUrl?: string; scoutingId?: string } | null
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
  const days = Math.floor(hours / 24)
  return `${days}일 전`
}

export default function NotificationDropdown({
  onClose,
  onRead,
}: {
  onClose: () => void
  onRead: () => void
}) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/notifications")
        if (res.ok) {
          const data = await res.json()
          setNotifications(data.notifications || [])
        }
      } catch { /* ignore */ }
      finally { setLoading(false) }
    }
    load()
  }, [])

  async function handleClick(n: Notification) {
    if (!n.readAt) {
      await fetch(`/api/notifications/${n.id}/read`, { method: "PATCH" })
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))
      )
      onRead()
    }
    if (n.data?.clickUrl) {
      router.push(n.data.clickUrl)
      onClose()
    }
  }

  return (
    <div className="absolute right-0 top-full mt-2 w-80 max-h-[400px] overflow-y-auto rounded-xl bg-white shadow-lg border border-gray-200 z-50">
      <div className="px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-semibold text-[#333]">알림</span>
      </div>
      {loading ? (
        <div className="px-4 py-8 text-center text-sm text-gray-400">로딩 중...</div>
      ) : notifications.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-gray-400">알림이 없습니다</div>
      ) : (
        <div>
          {notifications.slice(0, 20).map((n) => (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer ${
                !n.readAt ? "bg-blue-50/50" : ""
              }`}
            >
              <div className="flex items-start gap-2">
                {!n.readAt && (
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-[#1976D2] shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-[#333]">{n.title}</div>
                  <div className="text-xs text-gray-600 mt-0.5 line-clamp-2">{n.body}</div>
                  <div className="text-[10px] text-gray-400 mt-1">{timeAgo(n.createdAt)}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
