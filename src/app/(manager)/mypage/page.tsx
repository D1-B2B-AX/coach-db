"use client"

import React, { Suspense, useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Course, DeletedCourse, Scouting, EngagementHistory } from "./utils"
import CourseTab from "./CourseTab"
import ScoutingTab from "./ScoutingTab"
import EngagementHistorySection from "./EngagementHistory"

export default function MyPage() {
  return (
    <Suspense fallback={<MyPageSkeleton />}>
      <MyPageContent />
    </Suspense>
  )
}

function MyPageContent() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")

  const [scoutings, setScoutings] = useState<Scouting[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [deletedCourses, setDeletedCourses] = useState<DeletedCourse[]>([])
  const [engagementHistory, setEngagementHistory] = useState<EngagementHistory[]>([])
  const [managerId, setManagerId] = useState<string | null>(null)
  const [myId, setMyId] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [managers, setManagers] = useState<{ id: string; name: string; email: string }[]>([])
  const [loading, setLoading] = useState(true)
  const activeTab = tabParam === "courses" ? "courses" : "scoutings"
  const isViewingOther = myId !== null && managerId !== null && myId !== managerId

  useEffect(() => {
    async function fetchMe() {
      try {
        const res = await fetch("/api/auth/me")
        if (res.ok) {
          const data = await res.json()
          setMyId(data.id)
          setManagerId(data.id)
          setRole(data.role)
          if (data.role === "admin") {
            const mRes = await fetch("/api/admin/managers")
            if (mRes.ok) {
              const mData = await mRes.json()
              setManagers(mData.managers || [])
            }
          }
        } else {
          console.error("[mypage] /api/auth/me failed:", res.status)
        }
      } catch (e) { console.error("[mypage] fetchMe error:", e) }
    }
    fetchMe()
  }, [])

  const fetchScoutings = useCallback(async (silent = false) => {
    if (!managerId) return
    if (!silent) setLoading(true)
    try {
      const res = await fetch(`/api/scoutings?managerId=${managerId}`)
      if (res.ok) {
        const data = await res.json()
        setScoutings(data.scoutings || [])
      }
    } catch { /* ignore */ }
    finally { if (!silent) setLoading(false) }
  }, [managerId])

  const fetchCourses = useCallback(async () => {
    if (!managerId) return
    try {
      const courseUrl = isViewingOther ? `/api/courses?managerId=${managerId}` : "/api/courses"
      const res = await fetch(courseUrl)
      if (res.ok) {
        const data = await res.json()
        const list = (data.courses || []).map((c: {
          id: string; name: string; description: string | null
          startDate: string | null; endDate: string | null; workHours: string | null
          location: string | null; hourlyRate: number | null; remarks: string | null; createdAt: string
        }) => ({
          id: c.id,
          name: c.name,
          description: c.description || null,
          startDate: c.startDate,
          endDate: c.endDate,
          workHours: c.workHours || null,
          location: c.location || null,
          hourlyRate: c.hourlyRate ?? null,
          remarks: c.remarks || null,
          createdAt: c.createdAt,
        }))
        setCourses(list)
        setDeletedCourses(
          (data.deletedCourses || []).map((c: { id: string; name: string; startDate: string | null; endDate: string | null; deletedAt: string }) => ({
            id: c.id, name: c.name, startDate: c.startDate, endDate: c.endDate, deletedAt: c.deletedAt,
          }))
        )
      }
    } catch { /* ignore */ }
  }, [managerId, isViewingOther])

  const fetchEngagementHistory = useCallback(async () => {
    try {
      const engUrl = isViewingOther ? `/api/engagements/mine?managerId=${managerId}` : "/api/engagements/mine"
      const res = await fetch(engUrl)
      if (res.ok) {
        const data = await res.json()
        setEngagementHistory(data.engagements || [])
      }
    } catch { /* ignore */ }
  }, [managerId, isViewingOther])

  useEffect(() => {
    fetchScoutings()
    fetchCourses()
    fetchEngagementHistory()
    let interval: ReturnType<typeof setInterval> | null = setInterval(() => fetchScoutings(true), 30000)
    function handleVisibility() {
      if (document.hidden) { if (interval) { clearInterval(interval); interval = null } }
      else { fetchScoutings(true); interval = setInterval(() => fetchScoutings(true), 30000) }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => { if (interval) clearInterval(interval); document.removeEventListener('visibilitychange', handleVisibility) }
  }, [fetchScoutings, fetchCourses, fetchEngagementHistory])

  // Course CRUD handlers
  async function handleCourseCreate(name: string, startDate?: string, endDate?: string) {
    const res = await fetch("/api/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, startDate: startDate || null, endDate: endDate || null }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || "과정 생성에 실패했습니다")
    }
    const course = await res.json()
    setCourses(prev => [course, ...prev])
  }

  async function handleCourseUpdate(id: string, data: Partial<Course>) {
    const res = await fetch(`/api/courses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      const result = await res.json()
      setCourses(prev => prev.map(c => c.id === id ? { ...c, ...data } : c))
      if (result.resetScoutings > 0) {
        fetchScoutings(true)
      }
    }
  }

  async function handleCourseDelete(id: string) {
    const res = await fetch(`/api/courses/${id}`, { method: "DELETE" })
    if (res.ok) {
      setCourses(prev => prev.filter(c => c.id !== id))
    }
  }

  // Scouting status change handler
  async function handleStatusChange(id: string, newStatus: string, extra?: Record<string, string>) {
    const body: Record<string, string> = { status: newStatus, ...extra }
    const res = await fetch(`/api/scoutings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error || '처리 중 오류가 발생했습니다')
      await fetchScoutings(true)
      return
    }

    setScoutings(prev =>
      prev.map(s => s.id === id ? {
        ...s,
        status: newStatus,
        ...(newStatus === "confirmed" && extra && {
          courseName: extra.courseName ?? s.courseName,
          hireStart: extra.hireStart ?? s.hireStart,
          hireEnd: extra.hireEnd ?? s.hireEnd,
          scheduleText: extra.scheduleText ?? s.scheduleText,
        }),
      } : s)
    )

    if (newStatus === "confirmed") {
      const found = scoutings.find(x => x.id === id)
      if (found) {
        // Auto-cancel siblings (same course + date, accepted)
        const siblings = scoutings.filter(s =>
          s.id !== id &&
          s.status === "accepted" &&
          s.date.slice(0, 10) === found.date.slice(0, 10) &&
          s.courseId === found.courseId
        )
        const siblingResults = await Promise.allSettled(
          siblings.map(sib =>
            fetch(`/api/scoutings/${sib.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "cancelled" }),
            })
          )
        )
        siblingResults.forEach((r, i) => {
          if (r.status === "rejected") console.error(`[mypage] sibling cancel failed for ${siblings[i].id}:`, r.reason)
        })
        if (siblings.length > 0) {
          setScoutings(prev => prev.map(s =>
            siblings.some(sib => sib.id === s.id) ? { ...s, status: "cancelled" } : s
          ))
        }

      }
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="p-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">

      {role === "admin" && managers.length > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <select
            value={managerId || ""}
            onChange={(e) => setManagerId(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700"
          >
            {managers.filter(m => m.id !== myId).length > 0 && (
              <>
                <option value={myId || ""}>내 마이페이지</option>
                {managers.filter(m => m.id !== myId).map(m => (
                  <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
                ))}
              </>
            )}
          </select>
          {isViewingOther && (
            <span className="text-xs text-amber-600 font-medium">열람 모드</span>
          )}
        </div>
      )}

      {activeTab === "scoutings" && managerId && (
        <ScoutingTab
          courses={courses}
          scoutings={scoutings}
          managerId={managerId}
          onStatusChange={handleStatusChange}
          onRefresh={() => fetchScoutings(true)}
        />
      )}

      {activeTab === "courses" && (
        <>
          <CourseTab
            courses={courses}
            deletedCourses={deletedCourses}
            scoutings={scoutings}
            onCourseCreate={handleCourseCreate}
            onCourseUpdate={handleCourseUpdate}
            onCourseDelete={handleCourseDelete}
          />
          <EngagementHistorySection engagements={engagementHistory} />
        </>
      )}
    </div>
  )
}

function MyPageSkeleton() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="p-4 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />
        ))}
      </div>
    </div>
  )
}
