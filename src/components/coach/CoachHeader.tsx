"use client"

import { useState, useEffect, useCallback } from "react"

const OPEN_SCOUTING_ALERTS_EVENT = "coach:open-scouting-alerts"
const SCOUTING_ALERTS_COUNT_EVENT = "coach:scouting-alerts-count"

interface CoachHeaderProps {
  coachName: string
  token?: string
  onProfile?: () => void
}

const BUTTON_BASE = "inline-flex h-10 items-center justify-center rounded-md bg-white/20 text-white backdrop-blur-sm transition-colors"

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

  useEffect(() => {
    function handleCountSync(event: Event) {
      const customEvent = event as CustomEvent<{ count?: number }>
      const count = customEvent.detail?.count
      if (typeof count === "number") {
        setUnreadCount(Math.max(0, count))
      }
    }
    window.addEventListener(SCOUTING_ALERTS_COUNT_EVENT, handleCountSync)
    return () => window.removeEventListener(SCOUTING_ALERTS_COUNT_EVENT, handleCountSync)
  }, [])

  function scrollToAlerts() {
    const el = document.getElementById("scouting-alerts")
    if (el) el.scrollIntoView({ behavior: "smooth" })
    void fetchCount()
    window.dispatchEvent(new CustomEvent(OPEN_SCOUTING_ALERTS_EVENT))
  }

  return (
    <div className="bg-[#1565C0] px-5 pt-5 pb-4 text-white">
      <div className="flex items-center">
        <img
          src="/fastcampus-logo.svg"
          alt="Fast Campus"
          className="h-5 w-auto"
        />
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <h2 className="text-[18px] font-semibold leading-snug">
            안녕하세요, {coachName}님
          </h2>
          <p className="mt-1 text-[13px] opacity-85">
            날짜를 선택하여 일정을 입력해주세요
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-3">
          {token && (
            <button
              onClick={scrollToAlerts}
              className={`${BUTTON_BASE} relative w-9 h-9 px-0 hover:bg-white/30`}
              title="받은 요청"
              type="button"
            >
              <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold px-0.5">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          )}
          {onProfile && (
            <button
              onClick={onProfile}
              className={`${BUTTON_BASE} w-9 h-9 px-0 hover:bg-white/30`}
              title="프로필 수정"
              type="button"
            >
              <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
