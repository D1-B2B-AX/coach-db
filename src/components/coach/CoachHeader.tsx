"use client"

import { useState, useEffect, useCallback } from "react"

interface CoachHeaderProps {
  coachName: string
  token?: string
  onProfile?: () => void
}

export default function CoachHeader({
  coachName,
  token,
  onProfile,
}: CoachHeaderProps) {
  const [unreadCount, setUnreadCount] = useState(0)

  const fetchCount = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(
        `/api/coach/notifications/unread-count?token=${token}&type=scouting_request&pendingOnly=true`
      )
      if (res.ok) setUnreadCount((await res.json()).count)
    } catch { /* ignore */ }
  }, [token])

  useEffect(() => {
    const initialFetch = window.setTimeout(() => {
      void fetchCount()
    }, 0)
    const interval = window.setInterval(() => {
      void fetchCount()
    }, 30000)
    return () => {
      window.clearTimeout(initialFetch)
      window.clearInterval(interval)
    }
  }, [fetchCount])

  function scrollToAlerts() {
    const el = document.getElementById("scouting-alerts")
    if (el) el.scrollIntoView({ behavior: "smooth" })
  }

  return (
    <div className="bg-[#1565C0] px-7 pt-6 pb-4 text-white">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[18px] font-semibold leading-snug">
            안녕하세요, {coachName}님
          </h2>
          <p className="mt-1 text-[13px] opacity-85">
            날짜를 선택하여 일정을 입력해주세요
          </p>
        </div>
        <div className="flex items-center gap-2">
          {token && (
            <button
              onClick={scrollToAlerts}
              className="relative cursor-pointer rounded-md bg-white/20 px-3 py-1.5 text-[13px] font-medium text-white backdrop-blur-sm hover:bg-white/30 transition-colors"
            >
              받은 요청
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          )}
          {onProfile && (
            <button
              onClick={onProfile}
              className="cursor-pointer rounded-md bg-white/20 p-1.5 text-white backdrop-blur-sm hover:bg-white/30 transition-colors"
              title="프로필 수정"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
