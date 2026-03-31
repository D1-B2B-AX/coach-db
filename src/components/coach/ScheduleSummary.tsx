"use client"

import { useState } from "react"
import { useEscClose } from "@/lib/useEscClose"

interface Engagement {
  id: string
  courseName: string
  startDate: string
  endDate: string
  startTime: string | null
  endTime: string | null
  location: string | null
  status: string
}

interface ScheduleSummaryProps {
  engagements: Engagement[]
  lastSavedAt?: string | null
}

function formatDateRange(startDate: string, endDate: string): string {
  const s = new Date(startDate)
  const e = new Date(endDate)
  const sMonth = s.getMonth() + 1
  const sDay = s.getDate()
  const eDay = e.getDate()

  if (startDate === endDate) {
    return `${sMonth}/${sDay}`
  }
  if (s.getMonth() === e.getMonth()) {
    return `${sMonth}/${sDay}~${eDay}`
  }
  return `${sMonth}/${sDay}~${e.getMonth() + 1}/${eDay}`
}

function formatTimeRange(startTime: string | null, endTime: string | null): string {
  if (!startTime || !endTime) return ""
  return ` (${startTime}~${endTime})`
}

/** Remove internal tags like [부가세별도], (B2B) from course names shown to coaches */
export function cleanCourseName(name: string): string {
  return name
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, " ")
    .replace(/_/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
}

function statusBadge(status: string) {
  if (status === "scheduled" || status === "in_progress") {
    return (
      <span className="ml-1 inline-block rounded-[4px] bg-[#E3F2FD] px-1.5 py-0.5 text-[10px] font-semibold text-[#1976D2]">
        확정
      </span>
    )
  }
  return null
}

export default function ScheduleSummary({ engagements, lastSavedAt }: ScheduleSummaryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [popupEngagement, setPopupEngagement] = useState<Engagement | null>(null)

  useEscClose(popupEngagement !== null, () => setPopupEngagement(null))

  // Split engagements: confirmed (scheduled/in_progress) vs completed
  const confirmedEngagements = engagements.filter(
    (e) => e.status === "scheduled" || e.status === "in_progress"
  )

  // Compute stats
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`

  const pastEngagements = engagements
    .filter((e) => e.endDate < todayStr && (e.status === "completed" || e.status === "scheduled"))
    .sort((a, b) => b.endDate.localeCompare(a.endDate))

  const futureEngagements = confirmedEngagements
    .filter((e) => e.startDate >= todayStr)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))

  const thisMonthCount = engagements.filter((e) => {
    const sm = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0")
    return (
      e.startDate.startsWith(sm) &&
      (e.status === "scheduled" || e.status === "in_progress" || e.status === "completed")
    )
  }).length

  const lastEngagement = pastEngagements[0] ?? null
  const nextEngagement = futureEngagements[0] ?? null

  return (
    <>
      <div className="mt-5 rounded-xl border border-[#eee] bg-[#FAFAFA] p-4">
        <div className="mb-2.5 text-[13px] font-semibold text-[#333]">나의 스케줄</div>

        {/* Confirmed engagements */}
        {confirmedEngagements.map((eng) => (
          <div
            key={eng.id}
            className="cursor-pointer py-1 text-sm text-[#555] leading-relaxed hover:text-[#1976D2]"
            onClick={() => setPopupEngagement(eng)}
          >
            <span className="text-[#bbb]">· </span>
            {formatDateRange(eng.startDate, eng.endDate)} {cleanCourseName(eng.courseName)}
            {statusBadge(eng.status)}
          </div>
        ))}

        {confirmedEngagements.length === 0 && (
          <div className="py-1 pl-3 text-sm text-[#bbb]">확정된 일정이 없습니다</div>
        )}

        {/* Divider */}
        <div className="my-2 h-px bg-[#eee]" />

        {/* Stats */}
        <div className="space-y-2 text-sm text-[#555]">
          <div>
            <span className="text-xs text-[#999]">- 마지막 투입:</span>{" "}
            {lastEngagement
              ? `${formatDateRange(lastEngagement.startDate, lastEngagement.endDate)} ${cleanCourseName(lastEngagement.courseName)}`
              : "-"}
          </div>
          <div>
            <span className="text-xs text-[#999]">- 다음 예정:</span>{" "}
            {nextEngagement
              ? `${formatDateRange(nextEngagement.startDate, nextEngagement.endDate)} ${cleanCourseName(nextEngagement.courseName)}`
              : "-"}
          </div>
          <div>
            <span className="text-xs text-[#999]">- 이번 달 투입:</span> {thisMonthCount}회
          </div>
        </div>
        {lastSavedAt && (
          <div className="mt-2 text-right text-[10px] text-[#bbb]">
            마지막 저장: {(() => { const d = new Date(lastSavedAt); return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}` })()}
          </div>
        )}
      </div>

      {/* Confirmed detail popup */}
      {popupEngagement && (
        <>
          <div
            className="fixed inset-0 z-15 bg-black/30"
            onClick={() => setPopupEngagement(null)}
          />
          <div className="fixed top-1/2 left-1/2 z-20 w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.2)]">
            <h3 className="mb-3 text-[15px] font-semibold text-[#333]">
              {cleanCourseName(popupEngagement.courseName)}
            </h3>
            <div className="text-sm text-[#555] leading-relaxed">
              <div>
                <span className="text-sm text-[#999]">일시:</span>{" "}
                {formatDateRange(popupEngagement.startDate, popupEngagement.endDate)}
                {formatTimeRange(popupEngagement.startTime, popupEngagement.endTime)}
              </div>
              {popupEngagement.location && (
                <div>
                  <span className="text-sm text-[#999]">장소:</span>{" "}
                  {popupEngagement.location}
                </div>
              )}
              <div className="mt-2 text-xs text-[#bbb]">
                문의: 담당 매니저
              </div>
            </div>
            <button
              onClick={() => setPopupEngagement(null)}
              className="mt-4 block w-full cursor-pointer rounded-lg border border-[#e0e0e0] bg-[#FAFAFA] py-2.5 text-center text-sm text-[#555] hover:bg-gray-100 transition-colors"
            >
              닫기
            </button>
          </div>
        </>
      )}
    </>
  )
}
