"use client"

import { useMemo, useState } from "react"
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

interface EngagementGroup {
  key: string
  courseName: string
  items: Engagement[]
}

function groupEngagementsByCourse(items: Engagement[]): EngagementGroup[] {
  const map = new Map<string, EngagementGroup>()

  for (const engagement of items) {
    const courseName = cleanCourseName(engagement.courseName) || engagement.courseName.trim()
    const key = courseName || engagement.courseName
    const existing = map.get(key)
    if (existing) {
      existing.items.push(engagement)
    } else {
      map.set(key, { key, courseName: key, items: [engagement] })
    }
  }

  return [...map.values()]
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => {
        const dateDiff = b.startDate.localeCompare(a.startDate)
        if (dateDiff !== 0) return dateDiff
        return b.endDate.localeCompare(a.endDate)
      }),
    }))
    .sort((a, b) => b.items[0].startDate.localeCompare(a.items[0].startDate))
}

export default function ScheduleSummary({ engagements, lastSavedAt }: ScheduleSummaryProps) {
  const [popupEngagement, setPopupEngagement] = useState<Engagement | null>(null)

  useEscClose(popupEngagement !== null, () => setPopupEngagement(null))

  // Split engagements: confirmed (scheduled/in_progress) vs completed
  const confirmedEngagements = engagements.filter(
    (e) => e.status === "scheduled" || e.status === "in_progress"
  )
  const confirmedEngagementGroups = useMemo(
    () => groupEngagementsByCourse(confirmedEngagements),
    [confirmedEngagements]
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
        {confirmedEngagementGroups.length > 0 ? (
          <div className="space-y-3">
            {confirmedEngagementGroups.map((group) => (
              <div
                key={group.key}
                className="rounded-xl border border-[#E7EDF3] bg-white px-3 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold leading-tight text-[#333]">
                      {group.courseName}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[#999]">
                      {group.items.length}건
                    </div>
                  </div>
                  {group.items.length > 1 && (
                    <span className="shrink-0 rounded-full bg-[#EAF2FD] px-2 py-0.5 text-[10px] font-semibold text-[#1976D2]">
                      {group.items.length}건 묶음
                    </span>
                  )}
                </div>

                <div className="mt-3 space-y-2">
                  {group.items.map((eng) => (
                    <button
                      key={eng.id}
                      onClick={() => setPopupEngagement(eng)}
                      className="w-full cursor-pointer rounded-lg border border-[#EEF2F5] bg-[#FAFAFA] px-3 py-2.5 text-left transition-colors hover:border-[#D9E5F5] hover:bg-white"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-[#222]">
                            {formatDateRange(eng.startDate, eng.endDate)}
                          </div>
                          <div className="mt-0.5 truncate text-[12px] text-[#666]">
                            {eng.location || "장소 미정"}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-[13px] font-semibold text-[#1976D2]">
                            {formatTimeRange(eng.startTime, eng.endTime) || "-"}
                          </div>
                          <div className="mt-0.5 text-[10px] text-[#999]">상세보기</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
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
            <h3 className="mb-4 text-[16px] font-semibold leading-tight text-[#222]">
              {cleanCourseName(popupEngagement.courseName)}
            </h3>
            <div className="space-y-3 text-sm text-[#555] leading-relaxed">
              <div className="rounded-xl border border-[#E7EDF3] bg-[#F8FAFC] px-4 py-3">
                <div className="text-[11px] font-medium text-[#8A97A6]">일시</div>
                <div className="mt-1 text-[18px] font-semibold leading-tight text-[#222]">
                  {formatDateRange(popupEngagement.startDate, popupEngagement.endDate)}
                </div>
                {formatTimeRange(popupEngagement.startTime, popupEngagement.endTime) && (
                  <div className="mt-2 inline-flex rounded-full bg-[#E3F2FD] px-3 py-1.5 text-[15px] font-semibold text-[#1976D2]">
                    {formatTimeRange(popupEngagement.startTime, popupEngagement.endTime)}
                  </div>
                )}
              </div>
              {popupEngagement.location && (
                <div className="rounded-xl border border-[#EEF2F5] bg-white px-4 py-3">
                  <div className="text-[11px] font-medium text-[#8A97A6]">장소</div>
                  <div className="mt-1 text-[14px] font-medium text-[#333]">
                    {popupEngagement.location}
                  </div>
                </div>
              )}
              <div className="text-xs text-[#bbb]">문의: 담당 매니저</div>
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
