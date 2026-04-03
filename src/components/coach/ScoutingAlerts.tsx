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
    managerEmail?: string | null
    date?: string
    hireStart?: string | null
    hireEnd?: string | null
    courseName?: string
    clickUrl?: string
  } | null
  enriched?: { displayText?: string | null; courseName?: string | null; note?: string | null } | null
  readAt: string | null
  expired: boolean
  expiredAt: string | null
  createdAt: string
}

function formatAlertDate(dateStr: string): string {
  if (!dateStr) return "날짜 미정"
  const d = new Date(`${dateStr}T12:00:00`)
  if (Number.isNaN(d.getTime())) return "날짜 미정"
  const days = ["일", "월", "화", "수", "목", "금", "토"]
  return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`
}

function formatAlertTime(start?: string | null, end?: string | null): string {
  if (start && end) return `${start}~${end}`
  if (start) return `${start}부터`
  if (end) return `~${end}`
  return "시간 미정"
}

function formatManagerLabel(name?: string | null, email?: string | null): string {
  const base = name?.trim() ? `${name.trim()} 매니저` : "매니저 미정"
  if (!email?.trim()) return base
  return `${base} · ${email.trim()}`
}

export default function ScoutingAlerts({ token }: { token: string }) {
  const [alerts, setAlerts] = useState<ScoutingNotification[]>([])
  const [acting, setActing] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [forcedVisible, setForcedVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [modalTarget, setModalTarget] = useState<{
    date: string
    hireStart?: string | null
    hireEnd?: string | null
    managerEmail?: string | null
    courseName?: string | null
    note?: string | null
    managerName?: string | null
  } | null>(null)

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
      <div className="px-5 pt-4 pb-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#333]">받은 요청</h3>
          <span className="rounded-full bg-[#EAF2FD] px-2 py-0.5 text-[11px] font-semibold text-[#1976D2]">
            {pendingAlerts.length}건
          </span>
        </div>
        <div className="space-y-2">
          {loading && pendingAlerts.length === 0 && (
            <div className="rounded-xl border border-[#E1E8F0] bg-[#F8FAFC] px-4 py-3 text-sm text-[#5C6B7A]">
              요청을 불러오는 중입니다...
            </div>
          )}
          {!loading && loadError && (
            <div className="rounded-xl border border-[#F0E3DA] bg-[#FCF8F5] px-4 py-3 text-sm text-[#7A6355]">
              요청을 불러오지 못했습니다. 다시 시도해주세요.
            </div>
          )}
          {!loading && !loadError && pendingAlerts.length === 0 && (
            <div className="rounded-xl border border-[#ECEFF1] bg-[#FAFAFA] px-4 py-3 text-sm text-[#78909C]">
              현재 확인할 요청이 없습니다.
            </div>
          )}
          {visibleAlerts.map((a) => {
            return (
              <React.Fragment key={a.id}>
                <div
                  className="rounded-xl border border-[#E7EDF3] bg-[#FBFCFD] px-4 py-3 cursor-pointer transition-colors hover:border-[#D6E4F5]"
                  onClick={() => {
                    setModalTarget({
                      date: a.data?.date ?? "",
                      hireStart: a.data?.hireStart ?? null,
                      hireEnd: a.data?.hireEnd ?? null,
                      managerEmail: a.data?.managerEmail ?? null,
                      courseName: a.enriched?.courseName ?? a.data?.courseName ?? null,
                      note: a.enriched?.note ?? null,
                      managerName: a.data?.managerName ?? null,
                    })
                  }}
                >
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[#EAF2FD] px-2.5 py-1 text-[11px] font-semibold text-[#1976D2]">
                          {formatAlertDate(a.data?.date ?? "")}
                          {" "}
                          {formatAlertTime(a.data?.hireStart ?? null, a.data?.hireEnd ?? null)}
                        </span>
                        <span className="text-sm font-semibold text-[#1F2937]">
                          {a.enriched?.courseName || a.data?.courseName || "과정명 없음"}
                        </span>
                      </div>
                      <p className="text-[12px] text-[#6B7280]">
                        {formatManagerLabel(a.data?.managerName ?? null, a.data?.managerEmail ?? null)}
                      </p>
                      {a.enriched?.note && (
                        <p className="line-clamp-2 text-[12px] leading-relaxed text-[#374151]">
                          {a.enriched.note}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleAction(a, "accept") }}
                        disabled={acting === a.id}
                        className="cursor-pointer rounded-full bg-[#1976D2] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#1565C0] disabled:opacity-50"
                      >
                        {acting === a.id ? "..." : "수락"}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleAction(a, "reject") }}
                        disabled={acting === a.id}
                        className="cursor-pointer rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-50"
                      >
                        거절
                      </button>
                    </div>
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
              className="w-full py-1 text-center text-[11px] text-gray-500 hover:text-gray-700"
            >
              새로고침
            </button>
          )}
        </div>
      </div>
      {modalTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8E9BA8]">
                  날짜
                </p>
                <p className="text-lg font-semibold text-[#1F2937]">
                  {formatAlertDate(modalTarget.date)}
                  {" "}
                  {formatAlertTime(modalTarget.hireStart ?? null, modalTarget.hireEnd ?? null)}
                </p>
                {(modalTarget.managerName || modalTarget.managerEmail) && (
                  <p className="text-[12px] font-medium text-[#4B5563]">
                    {formatManagerLabel(modalTarget.managerName, modalTarget.managerEmail)}
                  </p>
                )}
              </div>
              <button
                onClick={() => setModalTarget(null)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 space-y-5 text-[#1F2937]">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8E9BA8]">
                  과정명
                </p>
                <p className="mt-1 text-xl font-semibold leading-tight text-[#1976D2]">
                  {modalTarget.courseName || "과정명 없음"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8E9BA8]">
                  제안한 매니저
                </p>
                <p className="mt-1 text-sm font-medium text-[#111]">
                  {formatManagerLabel(modalTarget.managerName, modalTarget.managerEmail)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8E9BA8]">
                  과정 설명
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[#374151]">
                  {modalTarget.note ?? "설명이 등록되어 있지 않습니다."}
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setModalTarget(null)}
                className="rounded-full border border-[#E5E7EB] bg-white px-4 py-1.5 text-sm font-semibold text-[#374151] hover:bg-gray-50 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
