"use client"

import { useState } from "react"
import { SURFACE_CARD_CLASS } from "@/components/ui/styles"

interface Candidate {
  coachId: string
  coachName: string
  assignedTrack: string | null
  currentMonthAssignments: number
}

interface DxCoachListProps {
  selectedTrack: string | null
  selectedDate: string | null
  candidates: Candidate[]
  loading: boolean
  assignedCoachIds: Set<string>
  onAssign: (coachId: string) => void
  onUnassign: (coachId: string) => void
  assigning: Set<string>
}

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"]
const MAX_COACHES_PER_TRACK = 2

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_NAMES[d.getDay()]})`
}

export default function DxCoachList({
  selectedTrack,
  selectedDate,
  candidates,
  loading,
  assignedCoachIds,
  onAssign,
  onUnassign,
  assigning,
}: DxCoachListProps) {
  const [warningVisible, setWarningVisible] = useState(false)

  const assignedCount = assignedCoachIds.size
  const atLimit = assignedCount >= MAX_COACHES_PER_TRACK

  function handleToggle(coachId: string) {
    if (assignedCoachIds.has(coachId)) {
      onUnassign(coachId)
      setWarningVisible(false)
    } else {
      if (atLimit) {
        setWarningVisible(true)
        return
      }
      onAssign(coachId)
      setWarningVisible(false)
    }
  }

  if (!selectedTrack || !selectedDate) {
    return (
      <div className={`${SURFACE_CARD_CLASS} p-5`}>
        <div className="flex h-48 items-center justify-center">
          <p className="text-sm text-gray-400">달력에서 반을 선택하세요</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`${SURFACE_CARD_CLASS} p-5`}>
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-[#2F3640]">{selectedTrack}</h3>
        <p className="mt-0.5 text-xs text-gray-500">{formatDateLabel(selectedDate)}</p>
      </div>

      {/* Warning */}
      {warningVisible && (
        <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
          반당 최대 {MAX_COACHES_PER_TRACK}명까지 배정할 수 있습니다.
        </div>
      )}

      {/* Coach list */}
      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <span className="text-xs text-gray-400">불러오는 중...</span>
        </div>
      ) : candidates.length === 0 ? (
        <div className="flex h-32 items-center justify-center">
          <span className="text-xs text-gray-400">후보 코치가 없습니다</span>
        </div>
      ) : (
        <div className="space-y-1">
          {candidates.map((candidate) => {
            const isAssigned = assignedCoachIds.has(candidate.coachId)
            const isOtherTrack =
              !isAssigned &&
              candidate.assignedTrack !== null &&
              candidate.assignedTrack !== selectedTrack
            const isProcessing = assigning.has(candidate.coachId)
            const isDisabled = isOtherTrack || isProcessing || (!isAssigned && atLimit)

            return (
              <label
                key={candidate.coachId}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                  isDisabled && !isAssigned
                    ? "opacity-50 cursor-not-allowed"
                    : "cursor-pointer hover:bg-gray-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isAssigned}
                  disabled={isDisabled && !isAssigned}
                  onChange={() => handleToggle(candidate.coachId)}
                  className="h-4 w-4 rounded border-gray-300 text-[#1976D2] accent-[#1976D2] cursor-pointer disabled:cursor-not-allowed"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${isAssigned ? "text-[#1565C0]" : "text-gray-700"}`}>
                      {candidate.coachName}
                    </span>
                    {isOtherTrack && (
                      <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                        다른 반 배정됨
                      </span>
                    )}
                    {isProcessing && (
                      <span className="text-[10px] text-gray-400">처리 중...</span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-[11px] text-gray-400 tabular-nums">
                  이번 달 {candidate.currentMonthAssignments}건
                </span>
              </label>
            )
          })}
        </div>
      )}

      {/* Summary */}
      {!loading && candidates.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="text-[11px] text-gray-400">
            배정 {assignedCount}/{MAX_COACHES_PER_TRACK}명
            {" | "}
            후보 {candidates.length}명
          </p>
        </div>
      )}
    </div>
  )
}
