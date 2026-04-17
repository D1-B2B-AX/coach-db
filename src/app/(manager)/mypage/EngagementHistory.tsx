"use client"

import React, { useState, useRef, useCallback, useMemo } from "react"
import Link from "next/link"
import { EngagementHistory as EH, CoachCourseGroup, groupByCoachCourse, ENGAGEMENT_STATUS } from "./utils"

interface Props {
  engagements: EH[]
  onReviewSaved?: () => void
}

function StarRating({ value, onChange, disabled }: { value: number | null; onChange: (v: number) => void; disabled?: boolean }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex gap-0.5" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button key={star} type="button"
          disabled={disabled}
          onClick={() => !disabled && onChange(star)}
          onMouseEnter={() => !disabled && setHover(star)}
          className={`text-base leading-none transition-colors ${disabled ? "cursor-default" : "cursor-pointer"}`}>
          <span className={(hover || value || 0) >= star ? "text-amber-400" : "text-gray-200"}>
            &#9733;
          </span>
        </button>
      ))}
    </div>
  )
}

function CoachCourseRow({ group, isPast }: { group: CoachCourseGroup; isPast: boolean }) {
  const firstEng = group.engagements[0]

  // 리뷰 (별점/한줄평/재투입) 상태 — reviewableId의 engagement에 저장
  const reviewTarget = group.reviewableId
    ? group.engagements.find(e => e.id === group.reviewableId) || firstEng
    : firstEng
  const [rating, setRating] = useState(reviewTarget.rating)
  const [feedback, setFeedback] = useState(reviewTarget.feedback || "")
  const [rehire, setRehire] = useState(reviewTarget.rehire ?? false)
  const [savingReview, setSavingReview] = useState(false)
  const reviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 공통 필드 상태
  const [location, setLocation] = useState(group.location || "")
  const [hourlyRate, setHourlyRate] = useState(group.hourlyRate !== null ? String(group.hourlyRate) : "")
  const [description, setDescription] = useState(group.description || "")
  const [remarks, setRemarks] = useState(group.remarks || "")
  const [savingShared, setSavingShared] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const dirty =
    (location || "") !== (group.location || "") ||
    (hourlyRate || "") !== (group.hourlyRate !== null ? String(group.hourlyRate) : "") ||
    (description || "") !== (group.description || "") ||
    (remarks || "") !== (group.remarks || "")

  const saveReview = useCallback((data: { rating?: number; feedback?: string; rehire?: boolean }) => {
    if (!group.reviewableId) return
    if (reviewTimer.current) clearTimeout(reviewTimer.current)
    reviewTimer.current = setTimeout(async () => {
      setSavingReview(true)
      try {
        await fetch(`/api/engagements/${group.reviewableId}/review`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        })
      } catch { /* ignore */ }
      finally { setSavingReview(false) }
    }, 500)
  }, [group.reviewableId])

  const saveShared = useCallback(async () => {
    setSavingShared(true)
    try {
      await fetch(`/api/engagements/group`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coachId: group.coach.id,
          courseName: group.courseName,
          location,
          hourlyRate: hourlyRate === "" ? null : Number(hourlyRate),
          description,
          remarks,
        }),
      })
      setSavedAt(Date.now())
    } catch { /* ignore */ }
    finally { setSavingShared(false) }
  }, [group.coach.id, group.courseName, location, hourlyRate, description, remarks])

  const status = ENGAGEMENT_STATUS[group.status] || { label: group.status, className: "text-gray-500 bg-gray-100" }
  const period = `${group.startDate.slice(5, 10)} ~ ${group.endDate.slice(5, 10)}`
  const showReview = !!group.reviewableId
  const dateCount = group.engagements.length

  return (
    <div className="border-b border-gray-50 last:border-0">
      <div className="flex items-start gap-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/coaches/${group.coach.id}`} className="text-sm font-medium text-[#1976D2] hover:underline">
              {group.coach.name}
            </Link>
            <span className="text-[11px] text-gray-400">{period}</span>
            {dateCount > 1 && <span className="text-[10px] text-gray-400">({dateCount}회차)</span>}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${status.className}`}>
              {status.label}
            </span>
            {(savingReview || savingShared) && <span className="text-[10px] text-gray-300">저장 중...</span>}
          </div>

          {showReview && (
            <div className="mt-1.5 flex items-center gap-3 flex-wrap">
              <StarRating value={rating} onChange={(v) => { setRating(v); saveReview({ rating: v }) }} />
              <input
                type="text" value={feedback}
                onChange={(ev) => { setFeedback(ev.target.value); saveReview({ feedback: ev.target.value }) }}
                placeholder="한줄 평가"
                className="flex-1 min-w-[120px] rounded-lg border border-gray-200 px-2 py-1 text-xs text-[#333] placeholder:text-gray-300 focus:border-[#1976D2] focus:outline-none"
              />
              <label className="flex items-center gap-1 cursor-pointer shrink-0">
                <input type="checkbox" checked={rehire}
                  onChange={(ev) => { setRehire(ev.target.checked); saveReview({ rehire: ev.target.checked }) }}
                  className="rounded border-gray-300 text-[#1976D2] focus:ring-[#1976D2] h-3.5 w-3.5" />
                <span className="text-[11px] text-gray-500">재투입</span>
              </label>
            </div>
          )}
        </div>
      </div>

      <div className="mb-2 space-y-2 rounded-lg bg-gray-50 px-3 py-2.5">
          {/* 회차 목록 */}
          <div className="space-y-0.5">
            <div className="text-[10px] font-medium text-gray-400">회차</div>
            {group.engagements.map(e => (
              <div key={e.id} className="text-[11px] text-gray-600">
                {e.startDate.slice(5, 10)} ~ {e.endDate.slice(5, 10)}
                {e.startTime && <span className="ml-2 text-gray-400">{e.startTime}~{e.endTime}</span>}
                <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[9px] ${ENGAGEMENT_STATUS[e.status]?.className || "bg-gray-100 text-gray-500"}`}>
                  {ENGAGEMENT_STATUS[e.status]?.label || e.status}
                </span>
              </div>
            ))}
          </div>

          {!isPast && <>
          {/* 공통 필드 편집 */}
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-0.5 block text-[10px] font-medium text-gray-500">장소</span>
              <input type="text" value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="예: 강남 본사"
                className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-[#333] placeholder:text-gray-300 focus:border-[#1976D2] focus:outline-none" />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[10px] font-medium text-gray-500">시급</span>
              <input type="number" min="0" step="100" value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="예: 15000"
                className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-[#333] placeholder:text-gray-300 focus:border-[#1976D2] focus:outline-none" />
            </label>
          </div>
          <label className="block">
            <span className="mb-0.5 block text-[10px] font-medium text-gray-500">과정 내용</span>
            <textarea value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="코치에게 보여질 과정 설명"
              rows={2}
              className="w-full resize-none rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-[#333] placeholder:text-gray-300 focus:border-[#1976D2] focus:outline-none" />
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[10px] font-medium text-gray-500">비고</span>
            <input type="text" value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="예: 식사 제공"
              className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-[#333] placeholder:text-gray-300 focus:border-[#1976D2] focus:outline-none" />
          </label>
          <div className="flex items-center justify-end gap-2">
            {savedAt && !dirty && <span className="text-[10px] text-gray-400">저장됨</span>}
            <button
              onClick={saveShared}
              disabled={!dirty || savingShared}
              className="cursor-pointer rounded-lg bg-[#1976D2] px-3 py-1 text-[11px] font-medium text-white hover:bg-[#1565C0] disabled:opacity-40 disabled:cursor-not-allowed">
              {savingShared ? "저장 중..." : "저장"}
            </button>
          </div>
          </>}
        </div>
    </div>
  )
}

function CourseCard({ courseName, groups, isPast }: { courseName: string; groups: CoachCourseGroup[]; isPast: boolean }) {
  const [open, setOpen] = useState(false)
  const coachCount = groups.length
  const earliest = groups.reduce((m, g) => g.startDate < m ? g.startDate : m, groups[0].startDate)
  const latest = groups.reduce((m, g) => g.endDate > m ? g.endDate : m, groups[0].endDate)
  const period = `${earliest.slice(0, 7)}${earliest.slice(0, 7) === latest.slice(0, 7) ? "" : ` ~ ${latest.slice(0, 7)}`}`

  return (
    <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100">
      <button
        onClick={() => setOpen(!open)}
        className="cursor-pointer w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 transition-colors rounded-2xl">
        <span className={`text-[11px] transition-transform ${open ? "rotate-90" : ""}`}>&#9654;</span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-[#333] truncate">{courseName}</span>
          <span className="ml-2 text-[11px] text-gray-400">코치 {coachCount}명</span>
        </div>
        <span className="text-[11px] text-gray-400 shrink-0">{period}</span>
      </button>
      {open && (
        <div className="px-5 pb-3">
          {groups.map((g) => <CoachCourseRow key={g.key} group={g} isPast={isPast} />)}
        </div>
      )}
    </div>
  )
}

export default function EngagementHistorySection({ engagements }: Props) {
  const upcomingGroups = useMemo(() => {
    const filtered = engagements.filter(e => e.status === "scheduled" || e.status === "in_progress")
    return groupByCourse(groupByCoachCourse(filtered))
  }, [engagements])
  const pastGroups = useMemo(() => {
    const filtered = engagements.filter(e => e.status === "completed" || e.status === "cancelled")
    return groupByCourse(groupByCoachCourse(filtered))
  }, [engagements])

  if (upcomingGroups.length === 0 && pastGroups.length === 0) {
    return (
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-gray-500 mb-3">투입 이력</h3>
        <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100 px-5 py-8 text-center text-sm text-gray-400">
          아직 투입 이력이 없습니다
        </div>
      </div>
    )
  }

  return (
    <>
      {upcomingGroups.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-500 mb-3">예정/진행 과정</h3>
          <div className="space-y-2">
            {upcomingGroups.map(({ courseName, groups }) => (
              <CourseCard key={courseName} courseName={courseName} groups={groups} isPast={false} />
            ))}
          </div>
        </div>
      )}
      {pastGroups.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-500 mb-3">지난 과정</h3>
          <div className="space-y-2">
            {pastGroups.map(({ courseName, groups }) => (
              <CourseCard key={courseName} courseName={courseName} groups={groups} isPast={true} />
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function groupByCourse(list: CoachCourseGroup[]): { courseName: string; groups: CoachCourseGroup[] }[] {
  const map = new Map<string, CoachCourseGroup[]>()
  for (const g of list) {
    if (!map.has(g.courseName)) map.set(g.courseName, [])
    map.get(g.courseName)!.push(g)
  }
  return [...map.entries()].map(([courseName, groups]) => ({ courseName, groups }))
}
