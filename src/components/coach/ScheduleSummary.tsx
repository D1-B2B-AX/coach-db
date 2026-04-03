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
  return `${startTime}~${endTime}`
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


export default function ScheduleSummary({ engagements, lastSavedAt }: ScheduleSummaryProps) {
  const [popupEngagement, setPopupEngagement] = useState<Engagement | null>(null)

  useEscClose(popupEngagement !== null, () => setPopupEngagement(null))

  // Split engagements: confirmed (scheduled/in_progress) vs completed
  const confirmedEngagements = engagements.filter(
    (e) => e.status === "scheduled" || e.status === "in_progress"
  )

  return (
    <>
      <div className="mt-5 rounded-xl border border-[#eee] bg-[#FAFAFA] p-4">
        <div className="mb-2.5 text-[13px] font-semibold text-[#333]">나의 일정</div>

        {/* Confirmed engagements */}
        {confirmedEngagements.length > 0 ? (
          <div className="space-y-1.5">
            {confirmedEngagements
              .sort((a, b) => a.startDate.localeCompare(b.startDate))
              .map((eng) => (
              <button
                key={eng.id}
                onClick={() => setPopupEngagement(eng)}
                className="w-full cursor-pointer rounded-lg border border-[#E7EDF3] bg-white px-3 py-2.5 text-left transition-colors hover:border-[#D9E5F5] hover:bg-[#F8FAFC]"
              >
                <div className="truncate text-[13px] font-semibold text-[#333]">
                  {cleanCourseName(eng.courseName)}
                </div>
                <div className="mt-0.5 text-[12px] text-[#888]">
                  {formatDateRange(eng.startDate, eng.endDate)}
                  {formatTimeRange(eng.startTime, eng.endTime) && (
                    <span className="ml-1 font-semibold text-[#1976D2]">{formatTimeRange(eng.startTime, eng.endTime)}</span>
                  )}
                  {eng.location && <span className="text-[#aaa]"> · {eng.location}</span>}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="py-1 pl-3 text-sm text-[#bbb]">확정된 일정이 없습니다</div>
        )}

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
          <div className="fixed top-1/2 left-1/2 z-20 w-72 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white px-5 py-5 shadow-[0_8px_30px_rgba(0,0,0,0.15)]">
            <div className="text-[15px] font-semibold text-[#222]">
              {cleanCourseName(popupEngagement.courseName)}
            </div>
            <div className="mt-3 space-y-1.5 text-[13px] text-[#555]">
              <div>
                <span className="text-[#999]">일시</span>
                <span className="ml-2 font-medium text-[#333]">{formatDateRange(popupEngagement.startDate, popupEngagement.endDate)}</span>
                {formatTimeRange(popupEngagement.startTime, popupEngagement.endTime) && (
                  <span className="ml-1 font-semibold text-[#1976D2]">{formatTimeRange(popupEngagement.startTime, popupEngagement.endTime)}</span>
                )}
              </div>
              {popupEngagement.location && (
                <div>
                  <span className="text-[#999]">장소</span>
                  <span className="ml-2 font-medium text-[#333]">{popupEngagement.location}</span>
                </div>
              )}
            </div>
            <button
              onClick={() => setPopupEngagement(null)}
              className="mt-4 block w-full cursor-pointer rounded-lg bg-[#F5F5F5] py-2 text-center text-[13px] text-[#666] hover:bg-[#EBEBEB] transition-colors"
            >
              닫기
            </button>
          </div>
        </>
      )}
    </>
  )
}
