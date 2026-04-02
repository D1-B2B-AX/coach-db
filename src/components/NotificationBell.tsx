"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import NotificationDropdown from "./NotificationDropdown"
import { usePushSubscription } from "@/hooks/usePushSubscription"

export default function NotificationBell() {
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const pushTriedRef = useRef(false)
  const { state: pushState, subscribed, subscribe } = usePushSubscription("/api/push/subscribe")

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count")
      if (res.ok) {
        const data = await res.json()
        setCount(data.count)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const res = await fetch("/api/notifications/unread-count")
        if (res.ok && !cancelled) setCount((await res.json()).count)
      } catch { /* ignore */ }
    }
    init()
    const interval = setInterval(fetchCount, 30000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [fetchCount])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const handleBellClick = useCallback(() => {
    setOpen(!open)
    // Auto-request push permission on first click, or re-subscribe if granted but not subscribed
    if (!pushTriedRef.current && (pushState === "prompt" || (pushState === "granted" && !subscribed))) {
      pushTriedRef.current = true
      subscribe()
    }
  }, [open, pushState, subscribed, subscribe])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleBellClick}
        className="relative p-1.5 rounded-lg text-gray-500 hover:text-[#1565C0] hover:bg-gray-50 transition-colors cursor-pointer"
        aria-label="알림"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      {open && (
        <NotificationDropdown
          onClose={() => setOpen(false)}
          onRead={() => setCount((c) => Math.max(0, c - 1))}
        />
      )}
    </div>
  )
}
