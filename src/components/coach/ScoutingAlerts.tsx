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
  enriched?: { displayText?: string | null; courseName?: string | null; note?: string | null; courseDescription?: string | null; extraNote?: string | null; location?: string | null; hourlyRate?: number | null; remarks?: string | null; managerName?: string | null } | null
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



export default function ScoutingAlerts({ token, onAction }: { token: string; onAction?: () => void }) {
  const [alerts, setAlerts] = useState<ScoutingNotification[]>([])
  const [acting, setActing] = useState<string | null>(null)
  const [bulkActing, setBulkActing] = useState(false)
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
    courseDescription?: string | null
    extraNote?: string | null
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

    if (action === "accept") {
      if (!confirm("수락하시겠습니까?")) return
    }
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
        onAction?.()
      } else if (res.status === 409) {
        window.alert("이 섭외는 매니저에 의해 취소되었습니다.")
        fetchAlerts()
      }
    } catch { /* ignore */ }
    finally { setActing(null) }
  }

  async function handleBulkAction(items: ScoutingNotification[], action: "accept" | "reject") {
    const label = action === "accept" ? "수락" : "거절"
    if (!confirm(`${items.length}건을 전부 ${label}하시겠습니까?`)) return
    setBulkActing(true)
    let success = 0
    let fail = 0
    for (const a of items) {
      if (!a.data?.scoutingId) continue
      try {
        const res = await fetch(`/api/coach/scoutings/${a.data.scoutingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action }),
        })
        if (res.ok) {
          await fetch(`/api/coach/notifications/${a.id}/read?token=${token}`, { method: "PATCH" })
          success++
        } else {
          fail++
        }
      } catch { fail++ }
    }
    setBulkActing(false)
    if (fail > 0) alert(`${success + fail}건 중 ${fail}건 처리 실패`)
    fetchAlerts()
    onAction?.()
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
          {(() => {
            // 전체 pendingAlerts로 과정별 그룹핑 (정확한 카운트)
            const grouped = new Map<string, ScoutingNotification[]>()
            for (const a of pendingAlerts) {
              const key = a.enriched?.courseName || a.data?.courseName || "과정명 없음"
              if (!grouped.has(key)) grouped.set(key, [])
              grouped.get(key)!.push(a)
            }
            // 각 그룹 내 날짜순 정렬
            for (const [, items] of grouped) {
              items.sort((a, b) => (a.data?.date ?? "").localeCompare(b.data?.date ?? ""))
            }
            // 미확장 시 그룹별로 limit 적용
            const groupLimit = expanded ? Infinity : limit
            return [...grouped.entries()].map(([courseName, items]) => {
              // 그룹 대표 정보 (같은 과정이면 동일)
              const rep = items.find((a) => a.enriched)?.enriched
              const courseDesc = rep?.courseDescription ?? null
              const extraNote = rep?.extraNote ?? null
              const location = rep?.location ?? null
              const hourlyRate = rep?.hourlyRate ?? null
              const courseRemarks = rep?.remarks ?? null
              const managerName = rep?.managerName ?? items[0]?.data?.managerName ?? null
              return (
              <div key={courseName} className="space-y-1.5 rounded-xl border-l-[3px] border-l-[#1976D2] bg-[#F5F8FC] pl-3.5 pr-3 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold text-[#333]">{courseName}</span>
                  <span className="text-[10px] text-gray-400">{items.length}건</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      onClick={() => handleBulkAction(items, "accept")}
                      disabled={bulkActing}
                      className="cursor-pointer rounded-full bg-[#1976D2] px-2.5 py-1 text-[10px] font-medium text-white hover:bg-[#1565C0] disabled:opacity-50"
                    >
                      {bulkActing ? "..." : "전부 수락"}
                    </button>
                    <button
                      onClick={() => handleBulkAction(items, "reject")}
                      disabled={bulkActing}
                      className="cursor-pointer rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-medium text-gray-500 hover:bg-gray-200 disabled:opacity-50"
                    >
                      전부 거절
                    </button>
                  </div>
                </div>
                {(location || hourlyRate || managerName || courseRemarks) && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-[#555]">
                    {managerName && <span>{managerName.trim()} 매니저</span>}
                    {location && <span>{location}</span>}
                    {hourlyRate && <span>시급 {hourlyRate.toLocaleString()}원</span>}
                    {courseRemarks && <span>{courseRemarks}</span>}
                  </div>
                )}
                {(courseDesc || extraNote) && (
                  <div className="rounded-xl border border-[#E7EDF3] bg-[#F8FAFC] px-4 py-2.5 space-y-1">
                    {courseDesc && (
                      <p className="text-[12px] leading-relaxed text-[#374151]">
                        <span className="text-[#999]">과정설명</span>
                        <span className="ml-1.5">{courseDesc}</span>
                      </p>
                    )}
                    {extraNote && (
                      <p className="text-[12px] leading-relaxed text-[#374151]">
                        <span className="text-[#999]">기타</span>
                        <span className="ml-1.5">{extraNote}</span>
                      </p>
                    )}
                  </div>
                )}
                {items.slice(0, groupLimit).map((a) => (
                  <div
                    key={a.id}
                    className="rounded-xl border border-[#E7EDF3] bg-[#FBFCFD] px-4 py-3 cursor-pointer transition-colors hover:border-[#D6E4F5]"
                    onClick={() => {
                      setModalTarget({
                        date: a.data?.date ?? "",
                        hireStart: a.data?.hireStart ?? null,
                        hireEnd: a.data?.hireEnd ?? null,
                        managerEmail: a.data?.managerEmail ?? null,
                        courseName: a.enriched?.courseName ?? a.data?.courseName ?? null,
                        courseDescription: a.enriched?.courseDescription ?? null,
                        extraNote: a.enriched?.extraNote ?? null,
                        managerName: a.enriched?.managerName ?? a.data?.managerName ?? null,
                      })
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[#EAF2FD] px-2.5 py-1 text-[11px] font-semibold text-[#1976D2]">
                          {formatAlertDate(a.data?.date ?? "")}
                          {" "}
                          {formatAlertTime(a.data?.hireStart ?? null, a.data?.hireEnd ?? null)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
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
                ))}
              </div>
              )
            })
          })()}
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
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setModalTarget(null)} />
          <div className="fixed top-1/2 left-1/2 z-50 w-72 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white px-5 py-5 shadow-[0_8px_30px_rgba(0,0,0,0.15)]">
            <div className="text-[15px] font-semibold text-[#222]">
              {modalTarget.courseName || "과정명 없음"}
            </div>
            <div className="mt-3 space-y-1.5 text-[13px] text-[#555]">
              <div>
                <span className="text-[#999]">일시</span>
                <span className="ml-2 font-medium text-[#333]">
                  {formatAlertDate(modalTarget.date)} {formatAlertTime(modalTarget.hireStart ?? null, modalTarget.hireEnd ?? null)}
                </span>
              </div>
              {(modalTarget.managerName || modalTarget.managerEmail) && (
                <div>
                  <span className="text-[#999]">매니저</span>
                  <span className="ml-2 font-medium text-[#333]">
                    {formatManagerLabel(modalTarget.managerName, modalTarget.managerEmail)}
                  </span>
                </div>
              )}
              {modalTarget.courseDescription && (
                <div>
                  <span className="text-[#999]">과정설명</span>
                  <span className="ml-2 text-[#333]">{modalTarget.courseDescription}</span>
                </div>
              )}
              {modalTarget.extraNote && (
                <div>
                  <span className="text-[#999]">기타</span>
                  <span className="ml-2 text-[#333]">{modalTarget.extraNote}</span>
                </div>
              )}
            </div>
            <button
              onClick={() => setModalTarget(null)}
              className="mt-4 block w-full cursor-pointer rounded-lg bg-[#F5F5F5] py-2 text-center text-[13px] text-[#666] hover:bg-[#EBEBEB] transition-colors"
            >
              닫기
            </button>
          </div>
        </>
      )}
    </div>
  )
}
