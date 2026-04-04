"use client"

import React, { Suspense, useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Course, Scouting, EngagementHistory } from "./utils"
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
  const [engagementHistory, setEngagementHistory] = useState<EngagementHistory[]>([])
  const [managerId, setManagerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const activeTab = tabParam === "courses" ? "courses" : "scoutings"

  useEffect(() => {
    async function fetchMe() {
      try {
        const res = await fetch("/api/auth/me")
        if (res.ok) {
          const data = await res.json()
          setManagerId(data.id)
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
      const res = await fetch("/api/courses")
      if (res.ok) {
        const data = await res.json()
        const list = (data.courses || []).map((c: {
          id: string; name: string; description: string | null
          startDate: string | null; endDate: string | null; workHours: string | null
          location: string | null; hourlyRate: number | null; createdAt: string
        }) => ({
          id: c.id,
          name: c.name,
          description: c.description || null,
          startDate: c.startDate,
          endDate: c.endDate,
          workHours: c.workHours || null,
          location: c.location || null,
          hourlyRate: c.hourlyRate ?? null,
          createdAt: c.createdAt,
        }))
        setCourses(list)
      }
    } catch { /* ignore */ }
  }, [managerId])

  const fetchEngagementHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/engagements/mine")
      if (res.ok) {
        const data = await res.json()
        setEngagementHistory(data.engagements || [])
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchScoutings()
    fetchCourses()
    fetchEngagementHistory()
    const interval = setInterval(() => fetchScoutings(true), 30000)
    return () => clearInterval(interval)
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
      setCourses(prev => prev.map(c => c.id === id ? { ...c, ...data } : c))
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
    if (res.ok) {
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
          for (const sib of siblings) {
            fetch(`/api/scoutings/${sib.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "cancelled" }),
            })
          }
          if (siblings.length > 0) {
            setScoutings(prev => prev.map(s =>
              siblings.some(sib => sib.id === s.id) ? { ...s, status: "cancelled" } : s
            ))
          }

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
