"use client"

import React, { useState, useMemo, useRef, useEffect } from "react"
import Link from "next/link"
import Badge from "@/components/ui/Badge"
import {
  Course,
  Scouting,
  CourseGroup,
  STATUS_CONFIG,
  formatFullDate,
  formatPeriod,
  getStatusCounts,
} from "./utils"
import ConfirmModal from "./ConfirmModal"

interface ScoutingTabProps {
  courses: Course[]
  scoutings: Scouting[]
  managerId: string
  onStatusChange: (id: string, newStatus: string, extra?: Record<string, string>) => Promise<void>
  onRefresh: () => void
}

// Popover component for a single coach chip
function CoachPopover({
  scouting,
  updating,
  copiedId,
  onAction,
  onConfirmOpen,
}: {
  scouting: Scouting
  updating: string | null
  copiedId: string | null
  onAction: (id: string, status: string) => void
  onConfirmOpen: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const s = scouting
  const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.scouting
  const isUpdating = updating === s.id

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const statusTone = s.status === "scouting" ? "orange"
    : s.status === "accepted" ? "green"
    : s.status === "confirmed" ? "blue"
    : s.status === "rejected" ? "red"
    : "gray"

  return (
    <div ref={ref} className="relative">
      {/* Chip */}
      <button
        onClick={() => setOpen(p => !p)}
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-all cursor-pointer ${
          s.status === "cancelled"
            ? "border border-gray-200 bg-gray-50 opacity-50"
            : "border border-gray-100 bg-[#F9FAFB] hover:border-gray-200 hover:bg-gray-50"
        }`}
      >
        <Badge
          variant="status"
          tone={statusTone}
          className="shrink-0 px-1.5 py-0.5 text-[9px]"
        >
          {cfg.label}
        </Badge>
        <span className="font-medium text-[#333]">{s.coach.name}</span>
        {copiedId === s.id && (
          <span className="text-[10px] text-green-600 font-medium">복사됨!</span>
        )}
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 min-w-[140px] rounded-xl border border-gray-100 bg-white shadow-lg p-1.5 space-y-0.5">
          {/* Profile link always shown */}
          <Link
            href={`/coaches/${s.coachId}`}
            className="flex w-full items-center px-3 py-1.5 text-xs text-[#333] rounded-lg hover:bg-gray-50 transition-colors"
            onClick={() => setOpen(false)}
          >
            프로필 보기
          </Link>

          {s.status === "accepted" && (
            <button
              onClick={() => { setOpen(false); onConfirmOpen(s.id) }}
              disabled={isUpdating}
              className="flex w-full items-center px-3 py-1.5 text-xs text-[#1976D2] font-medium rounded-lg hover:bg-[#E3F2FD] transition-colors disabled:opacity-50 cursor-pointer"
            >
              확정하기
            </button>
          )}

          {s.status === "confirmed" && (
            <button
              onClick={() => { setOpen(false); onConfirmOpen(s.id) }}
              disabled={isUpdating}
              className="flex w-full items-center px-3 py-1.5 text-xs text-gray-500 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer"
            >
              수정
            </button>
          )}

          {(s.status === "scouting" || s.status === "accepted" || s.status === "confirmed") && (
            <button
              onClick={() => {
                if (confirm(
                  s.status === "scouting" ? "이 찜꽁을 취소하시겠습니까?"
                  : s.status === "accepted" ? "이 수락을 취소하시겠습니까?"
                  : "이 확정을 취소하시겠습니까?"
                )) {
                  setOpen(false)
                  onAction(s.id, "cancelled")
                }
              }}
              disabled={isUpdating}
              className="flex w-full items-center px-3 py-1.5 text-xs text-red-500 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 cursor-pointer"
            >
              취소
            </button>
          )}

          {s.status === "cancelled" && (
            <button
              onClick={() => { setOpen(false); onAction(s.id, "scouting") }}
              disabled={isUpdating}
              className="flex w-full items-center px-3 py-1.5 text-xs text-[#F57C00] rounded-lg hover:bg-[#FFF3E0] transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isUpdating ? "..." : "복구"}
            </button>
          )}

        </div>
      )}
    </div>
  )
}

export default function ScoutingTab({ courses, scoutings, onStatusChange, onRefresh, managerId }: ScoutingTabProps) {
  const [statusFilter, setStatusFilter] = useState("all")
  const [openAccordions, setOpenAccordions] = useState<Set<string | null>>(new Set())
  const [updating, setUpdating] = useState<string | null>(null)
  const [confirmTargetId, setConfirmTargetId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const counts = useMemo(() => ({
    all: scoutings.length,
    scouting: scoutings.filter(s => s.status === "scouting").length,
    accepted: scoutings.filter(s => s.status === "accepted").length,
    rejected: scoutings.filter(s => s.status === "rejected").length,
    confirmed: scoutings.filter(s => s.status === "confirmed").length,
    cancelled: scoutings.filter(s => s.status === "cancelled").length,
  }), [scoutings])

  const filtered = useMemo(() => {
    if (statusFilter === "all") return scoutings
    return scoutings.filter(s => s.status === statusFilter)
  }, [scoutings, statusFilter])

  const courseGroups = useMemo(() => {
    const STATUS_PRIORITY: Record<string, number> = { confirmed: 0, accepted: 1, scouting: 2, rejected: 3, cancelled: 4 }
    const groupMap = new Map<string | null, CourseGroup>()

    for (const c of courses) {
      groupMap.set(c.id, {
        id: c.id, name: c.name, startDate: c.startDate, endDate: c.endDate, createdAt: c.createdAt,
        dateRows: new Map(), allScoutings: [],
      })
    }

    for (const s of filtered) {
      const key = s.courseId
      if (!groupMap.has(key)) {
        if (key === null) {
          groupMap.set(null, { id: null, name: "과정 미지정", startDate: null, endDate: null, dateRows: new Map(), allScoutings: [] })
        } else {
          groupMap.set(key, { id: key, name: s.course?.name || "알 수 없는 과정", startDate: s.course?.startDate || null, endDate: s.course?.endDate || null, dateRows: new Map(), allScoutings: [] })
        }
      }
      const group = groupMap.get(key)!
      const dateKey = s.date.slice(0, 10)
      if (!group.dateRows.has(dateKey)) group.dateRows.set(dateKey, [])
      group.dateRows.get(dateKey)!.push(s)
      group.allScoutings.push(s)
    }

    for (const group of groupMap.values()) {
      for (const [, arr] of group.dateRows) {
        arr.sort((a, b) => {
          const sp = (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9)
          if (sp !== 0) return sp
          return a.coach.name.localeCompare(b.coach.name, "ko")
        })
      }
    }

    const result: CourseGroup[] = []
    const realGroups = [...groupMap.values()].filter(g => g.id !== null)
    realGroups.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    result.push(...realGroups)
    const nullGroup = groupMap.get(null)
    if (nullGroup) result.push(nullGroup)
    return result
  }, [filtered, courses])

  // Initialize accordions open when courses load
  useEffect(() => {
    if (courses.length > 0) {
      setOpenAccordions(new Set([...courses.map(c => c.id), null as string | null]))
    }
  }, [courses.length]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleAccordion(id: string | null) {
    setOpenAccordions(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleAction(id: string, status: string) {
    setUpdating(id)
    try {
      await onStatusChange(id, status)
    } finally {
      setUpdating(null)
    }
  }

  async function handleConfirm(extra: Record<string, string>) {
    if (!confirmTargetId) return
    setUpdating(confirmTargetId)
    try {
      await onStatusChange(confirmTargetId, "confirmed", extra)
      // copy to clipboard
      const found = scoutings.find(x => x.id === confirmTargetId)
      if (found) {
        setCopiedId(confirmTargetId)
        setTimeout(() => setCopiedId(null), 3000)
      }
      setConfirmTargetId(null)
    } finally {
      setUpdating(null)
    }
    onRefresh()
  }

  const confirmScouting = confirmTargetId ? scoutings.find(s => s.id === confirmTargetId) ?? null : null

  return (
    <div className="space-y-3">
      {/* Status filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {(["all", "scouting", "accepted", "rejected", "confirmed", "cancelled"] as const).map((key) => {
          const cfg = STATUS_CONFIG[key]
          const active = statusFilter === key
          const count = counts[key] || 0
          const isZeroState = count === 0
          return (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                isZeroState ? "bg-gray-100 text-gray-400 grayscale opacity-70" : active ? cfg.activeClassName : cfg.className
              }`}
            >
              {cfg.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Course accordion groups */}
      <div className="space-y-3">
        {courseGroups.length === 0 || (courseGroups.every(g => g.allScoutings.length === 0 && g.id !== null) && !courseGroups.some(g => g.id === null && g.allScoutings.length > 0)) ? (
          <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100 px-5 py-16 text-center text-sm text-gray-400">
            {statusFilter === "all" ? "구인 내역이 없습니다" : "해당 상태의 내역이 없습니다"}
          </div>
        ) : (
          courseGroups.map(group => {
            const statusCounts = getStatusCounts(group.allScoutings)
            const sortedDateKeys = [...group.dateRows.keys()].sort()
            const isOpen = openAccordions.has(group.id)

            if (statusFilter !== "all" && group.allScoutings.length === 0) return null
            if (group.id === null && group.allScoutings.length === 0) return null

            return (
              <div key={group.id ?? "__null"} className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100">
                {/* Accordion header */}
                <button
                  onClick={() => toggleAccordion(group.id)}
                  className="w-full flex items-center gap-3 px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <span className={`text-gray-400 text-xs transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
                  <span className="font-semibold text-sm text-[#333]">{group.name}</span>
                  <span className="text-[11px] text-gray-400">{formatPeriod(group.startDate, group.endDate)}</span>
                  <div className="flex items-center gap-1.5 ml-auto">
                    {(["scouting", "accepted", "confirmed", "rejected"] as const).map(st => {
                      const count = statusCounts[st] || 0
                      if (count === 0) return null
                      const cfg = STATUS_CONFIG[st]
                      return (
                        <span key={st} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.className}`}>
                          {cfg.label}({count})
                        </span>
                      )
                    })}
                  </div>
                </button>

                {/* Accordion content */}
                {isOpen && (
                  <div>
                    {group.allScoutings.length === 0 ? (
                      <div className="px-5 py-8 text-center text-sm text-gray-400">
                        아직 컨택한 코치가 없습니다
                      </div>
                    ) : (
                      sortedDateKeys.map(dateKey => {
                        const scoutingsForDate = group.dateRows.get(dateKey)!
                        return (
                          <div key={dateKey} className="border-t border-gray-100">
                            <div className="px-5 py-2.5 flex items-start gap-3">
                              <div className="shrink-0 pt-0.5 min-w-[72px]">
                                <span className="text-[11px] font-semibold text-gray-400 whitespace-nowrap">
                                  {formatFullDate(dateKey)}
                                </span>
                                {(() => {
                                  const times = [...new Set(
                                    scoutingsForDate
                                      .filter(s => s.hireStart)
                                      .map(s => `${s.hireStart}~${s.hireEnd || ""}`)
                                  )]
                                  if (times.length === 0) return null
                                  return (
                                    <div className="text-[10px] text-gray-300 whitespace-nowrap">
                                      {times.join(", ")}
                                    </div>
                                  )
                                })()}
                              </div>
                              <div className="flex flex-col gap-2 w-full">
                                <div className="flex flex-wrap gap-1.5">
                                  {scoutingsForDate.map(s => (
                                    <CoachPopover
                                      key={s.id}
                                      scouting={s}
                                      updating={updating}
                                      copiedId={copiedId}
                                      onAction={handleAction}
                                      onConfirmOpen={(id) => setConfirmTargetId(id)}
                                    />
                                  ))}
                                </div>
                                {/* ConfirmModal inline per scouting */}
                                {scoutingsForDate.map(s => {
                                  if (confirmTargetId !== s.id || !confirmScouting) return null
                                  return (
                                    <ConfirmModal
                                      key={s.id}
                                      scouting={confirmScouting}
                                      scoutings={scoutings}
                                      updating={updating === confirmTargetId}
                                      onConfirm={handleConfirm}
                                      onClose={() => setConfirmTargetId(null)}
                                    />
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
