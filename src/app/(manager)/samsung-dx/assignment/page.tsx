"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import DxAssignmentCalendar from "@/components/dx-assignment/DxAssignmentCalendar"
import DxCoachList from "@/components/dx-assignment/DxCoachList"

interface TrackCoach {
  coachId: string
  coachName: string
  isAuto: boolean
}

interface Track {
  trackName: string
  track: string
  className: string
  round: string
  startDate: string
  endDate: string
  coaches: TrackCoach[]
}

interface Candidate {
  coachId: string
  coachName: string
  dxTag: string | null
  assignedTrack: string | null
  currentMonthAssignments: number
}

function formatYearMonth(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`
}

export default function DxAssignmentPage() {
  const now = new Date()
  const [currentYear, setCurrentYear] = useState(now.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(now.getMonth())
  const [tracks, setTracks] = useState<Track[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [tracksLoading, setTracksLoading] = useState(false)
  const [candidatesLoading, setCandidatesLoading] = useState(false)
  const [autoAssigning, setAutoAssigning] = useState(false)
  const [assigning, setAssigning] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const yearMonth = formatYearMonth(currentYear, currentMonth)

  // Assigned coach IDs for the selected track+date
  const assignedCoachIds = useMemo(() => {
    if (!selectedTrack || !selectedDate) return new Set<string>()
    const track = tracks.find(
      (t) => t.trackName === selectedTrack && selectedDate >= t.startDate && selectedDate <= t.endDate
    )
    if (!track) return new Set<string>()
    return new Set(track.coaches.map((c) => c.coachId))
  }, [tracks, selectedTrack, selectedDate])

  // Fetch tracks
  const fetchTracks = useCallback(async () => {
    setTracksLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/dx-assignment/tracks?yearMonth=${yearMonth}`)
      if (res.status === 401) {
        window.location.href = "/login"
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || "트랙 데이터를 불러오지 못했습니다")
        return
      }
      const data = await res.json()
      setTracks(data.tracks || [])
    } catch {
      setError("트랙 데이터를 불러오는 중 오류가 발생했습니다")
    } finally {
      setTracksLoading(false)
    }
  }, [yearMonth])

  // Fetch candidates for a date
  const fetchCandidates = useCallback(async (date: string) => {
    setCandidatesLoading(true)
    try {
      const res = await fetch(`/api/dx-assignment/candidates?date=${date}`)
      if (res.status === 401) {
        window.location.href = "/login"
        return
      }
      if (!res.ok) {
        setCandidates([])
        return
      }
      const data = await res.json()
      setCandidates(data.candidates || [])
    } catch {
      setCandidates([])
    } finally {
      setCandidatesLoading(false)
    }
  }, [])

  // Fetch tracks on mount and month change
  useEffect(() => {
    fetchTracks()
  }, [fetchTracks])

  // Fetch candidates when date changes
  useEffect(() => {
    if (selectedDate) {
      fetchCandidates(selectedDate)
    } else {
      setCandidates([])
    }
  }, [selectedDate, fetchCandidates])

  // Month navigation
  function handlePrevMonth() {
    setSelectedTrack(null)
    setSelectedDate(null)
    if (currentMonth === 0) {
      setCurrentYear((y) => y - 1)
      setCurrentMonth(11)
    } else {
      setCurrentMonth((m) => m - 1)
    }
  }

  function handleNextMonth() {
    setSelectedTrack(null)
    setSelectedDate(null)
    if (currentMonth === 11) {
      setCurrentYear((y) => y + 1)
      setCurrentMonth(0)
    } else {
      setCurrentMonth((m) => m + 1)
    }
  }

  // Select track + date
  function handleSelectTrack(trackName: string, date: string) {
    setSelectedTrack(trackName)
    setSelectedDate(date)
  }

  // Auto-assign
  async function handleAutoAssign() {
    setAutoAssigning(true)
    setError(null)
    try {
      const res = await fetch("/api/dx-assignment/auto-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yearMonth }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || "자동 배정에 실패했습니다")
        return
      }
      await fetchTracks()
      if (selectedDate) {
        await fetchCandidates(selectedDate)
      }
    } catch {
      setError("자동 배정 중 오류가 발생했습니다")
    } finally {
      setAutoAssigning(false)
    }
  }

  // Assign a coach
  async function handleAssign(coachId: string) {
    if (!selectedTrack || !selectedDate) return
    setAssigning((prev) => new Set(prev).add(coachId))
    try {
      const res = await fetch("/api/dx-assignment/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackName: selectedTrack, date: selectedDate, coachId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || "배정에 실패했습니다")
        return
      }
      await fetchTracks()
      await fetchCandidates(selectedDate)
    } catch {
      setError("배정 중 오류가 발생했습니다")
    } finally {
      setAssigning((prev) => {
        const next = new Set(prev)
        next.delete(coachId)
        return next
      })
    }
  }

  // Unassign a coach
  async function handleUnassign(coachId: string) {
    if (!selectedTrack || !selectedDate) return
    setAssigning((prev) => new Set(prev).add(coachId))
    try {
      const res = await fetch("/api/dx-assignment/assign", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackName: selectedTrack, date: selectedDate, coachId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || "배정 해제에 실패했습니다")
        return
      }
      await fetchTracks()
      await fetchCandidates(selectedDate)
    } catch {
      setError("배정 해제 중 오류가 발생했습니다")
    } finally {
      setAssigning((prev) => {
        const next = new Set(prev)
        next.delete(coachId)
        return next
      })
    }
  }

  return (
    <div className="mx-auto max-w-7xl overflow-x-hidden px-4 py-6 sm:px-6">
      {/* Page title */}
      <div className="mb-5">
        <h1 className="text-base font-semibold text-[#2F3640]">DX 코치 배정</h1>
        <p className="mt-1 text-xs text-gray-400">삼성 DX 과정에 코치를 배정합니다.</p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 cursor-pointer text-red-500 underline hover:text-red-700"
          >
            닫기
          </button>
        </div>
      )}

      {/* Loading overlay for tracks */}
      {tracksLoading && tracks.length === 0 && (
        <div className="flex h-64 items-center justify-center">
          <span className="text-sm text-gray-400">트랙 데이터를 불러오는 중...</span>
        </div>
      )}

      {/* Main layout: calendar (60%) + coach list (40%) */}
      {(!tracksLoading || tracks.length > 0) && (
        <div className="grid min-w-0 gap-5 lg:grid-cols-[3fr_2fr] xl:grid-cols-[7fr_3fr]">
          <DxAssignmentCalendar
            year={currentYear}
            month={currentMonth}
            tracks={tracks}
            selectedTrack={selectedTrack}
            selectedDate={selectedDate}
            onSelectTrack={handleSelectTrack}
            onPrevMonth={handlePrevMonth}
            onNextMonth={handleNextMonth}
            onAutoAssign={handleAutoAssign}
            autoAssigning={autoAssigning}
          />
          <DxCoachList
            selectedTrack={selectedTrack}
            selectedDate={selectedDate}
            candidates={candidates}
            loading={candidatesLoading}
            assignedCoachIds={assignedCoachIds}
            onAssign={handleAssign}
            onUnassign={handleUnassign}
            assigning={assigning}
          />
        </div>
      )}
    </div>
  )
}
