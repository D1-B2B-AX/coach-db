"use client"

import React, { useState, useRef, useCallback, useMemo } from "react"
import Link from "next/link"
import { EngagementHistory as EH, EngagementGroup, groupEngagements, ENGAGEMENT_STATUS } from "./utils"

interface Props {
  engagements: EH[]
  onReviewSaved?: () => void
}

function StarRating({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex gap-0.5" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button key={star} type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)}
          className="cursor-pointer text-base leading-none transition-colors">
          <span className={(hover || value || 0) >= star ? "text-amber-400" : "text-gray-200"}>
            &#9733;
          </span>
        </button>
      ))}
    </div>
  )
}

function EngagementRow({ e }: { e: EH }) {
  const [rating, setRating] = useState(e.rating)
  const [feedback, setFeedback] = useState(e.feedback || "")
  const [rehire, setRehire] = useState(e.rehire ?? false)
  const [saving, setSaving] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const save = useCallback((data: { rating?: number; feedback?: string; rehire?: boolean }) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setSaving(true)
      try {
        await fetch(`/api/engagements/${e.id}/review`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        })
      } catch { /* ignore */ }
      finally { setSaving(false) }
    }, 500)
  }, [e.id])

  const status = ENGAGEMENT_STATUS[e.status] || { label: e.status, className: "text-gray-500 bg-gray-100" }
  const period = `${e.startDate.slice(5, 10)} ~ ${e.endDate.slice(5, 10)}`

  return (
    <div className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
      {/* Coach + period + status */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/coaches/${e.coach.id}`} className="text-sm font-medium text-[#1976D2] hover:underline">
            {e.coach.name}
          </Link>
          <span className="text-[11px] text-gray-400">{period}</span>
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${status.className}`}>
            {status.label}
          </span>
          {saving && <span className="text-[10px] text-gray-300">저장 중...</span>}
        </div>

        {/* Rating + feedback + rehire */}
        <div className="mt-1.5 flex items-center gap-3 flex-wrap">
          <StarRating value={rating} onChange={(v) => { setRating(v); save({ rating: v }) }} />
          <input
            type="text" value={feedback}
            onChange={(ev) => { setFeedback(ev.target.value); save({ feedback: ev.target.value }) }}
            placeholder="한줄 평가"
            className="flex-1 min-w-[120px] rounded-lg border border-gray-200 px-2 py-1 text-xs text-[#333] placeholder:text-gray-300 focus:border-[#1976D2] focus:outline-none"
          />
          <label className="flex items-center gap-1 cursor-pointer shrink-0">
            <input type="checkbox" checked={rehire}
              onChange={(ev) => { setRehire(ev.target.checked); save({ rehire: ev.target.checked }) }}
              className="rounded border-gray-300 text-[#1976D2] focus:ring-[#1976D2] h-3.5 w-3.5" />
            <span className="text-[11px] text-gray-500">재투입</span>
          </label>
        </div>
      </div>
    </div>
  )
}

function GroupCard({ group }: { group: EngagementGroup }) {
  const [open, setOpen] = useState(false)
  const coachCount = new Set(group.engagements.map(e => e.coach.id)).size

  return (
    <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100">
      <button
        onClick={() => setOpen(!open)}
        className="cursor-pointer w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 transition-colors rounded-2xl">
        <span className={`text-[11px] transition-transform ${open ? "rotate-90" : ""}`}>&#9654;</span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-[#333] truncate">{group.courseName}</span>
          <span className="ml-2 text-[11px] text-gray-400">코치 {coachCount}명</span>
        </div>
        <span className="text-[11px] text-gray-400 shrink-0">{group.period}</span>
      </button>
      {open && (
        <div className="px-5 pb-3">
          {group.engagements.map((e) => (
            <EngagementRow key={e.id} e={e} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function EngagementHistorySection({ engagements }: Props) {
  const groups = useMemo(() => groupEngagements(engagements), [engagements])

  if (groups.length === 0) {
    return (
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-gray-500 mb-3">지난 과정</h3>
        <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100 px-5 py-8 text-center text-sm text-gray-400">
          아직 투입 이력이 없습니다
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-gray-500 mb-3">지난 과정</h3>
      <div className="space-y-2">
        {groups.map((g) => (
          <GroupCard key={g.courseName} group={g} />
        ))}
      </div>
    </div>
  )
}
