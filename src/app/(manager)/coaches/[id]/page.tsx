"use client"

import { useState, useEffect, useCallback } from "react"
import { useEscClose } from "@/lib/useEscClose"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import Link from "next/link"
import ProfileTab from "@/components/coaches/detail/ProfileTab"
import ScheduleTab from "@/components/coaches/detail/ScheduleTab"
import EngagementTab from "@/components/coaches/detail/EngagementTab"
import DocumentTab from "@/components/coaches/detail/DocumentTab"
import { Skeleton, SkeletonCard } from "@/components/Skeleton"

type TabKey = "profile" | "schedule" | "engagement"

interface CoachDetail {
  id: string
  name: string
  employeeId: string | null
  birthDate: string | null
  phone: string | null
  email: string | null
  affiliation: string | null
  workType: string | null
  status: string
  selfNote: string | null
  portfolioUrl: string | null
  availabilityDetail: string | null
  managerNote: string | null
  accessToken: string
  fields: { id: string; name: string }[]
  curriculums: { id: string; name: string }[]
  engagements: {
    id: string
    courseName: string
    startDate: string
    endDate: string
    startTime: string | null
    endTime: string | null
    status: string
  }[]
  engagementSchedules: {
    date: string
    startTime: string
    endTime: string
    engagement: { courseName: string }
  }[]
  documentCount: number
  avgRating: number | null
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "profile", label: "프로필" },
  { key: "schedule", label: "스케줄" },
  { key: "engagement", label: "근무 이력" },
]

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active: { label: "활동중", className: "bg-[#E8F5E9] text-[#2E7D32]" },
  inactive: { label: "비활동", className: "bg-gray-100 text-gray-500" },
  on_leave: { label: "휴직", className: "bg-[#FFF8E1] text-[#F57F17]" },
}

const WORK_TYPE_COLOR: Record<string, string> = {
  "실습코치": "bg-[#F3E5F5] text-[#7B1FA2]",
  "운영조교": "bg-[#E0F2F1] text-[#00695C]",
  _default: "bg-[#E8EAF6] text-[#283593]",
}

export default function CoachDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session } = useSession()
  const coachId = params.id as string
  const managerRole = (session as any)?.managerRole
  const managerName = session?.user?.name || ""

  const tabFromUrl = searchParams.get("tab") as TabKey | null
  const validTabs: TabKey[] = ["profile", "schedule", "engagement"]

  const [coach, setCoach] = useState<CoachDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>(
    tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : "profile"
  )
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  useEscClose(showDeleteDialog, () => setShowDeleteDialog(false))

  const fetchCoach = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/coaches/${coachId}`)
      if (res.ok) {
        const data = await res.json()
        setCoach(data)
      } else if (res.status === 404) {
        router.push("/coaches")
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [coachId, router])

  useEffect(() => {
    fetchCoach()
  }, [fetchCoach])

  async function handleDelete() {
    if (!confirmEmail.trim()) {
      setDeleteError("코치 이름을 입력해주세요.")
      return
    }
    if (confirmEmail.trim() !== coach?.name) {
      setDeleteError("이름이 일치하지 않습니다.")
      return
    }
    setDeleting(true)
    setDeleteError("")
    try {
      const res = await fetch(`/api/coaches/${coachId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName: confirmEmail.trim() }),
      })
      if (res.ok) {
        router.push("/coaches")
      } else {
        const data = await res.json()
        setDeleteError(data.error || "삭제에 실패했습니다.")
      }
    } catch {
      setDeleteError("네트워크 오류가 발생했습니다.")
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header skeleton */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-5" />
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-5 w-12" />
        </div>
        {/* Tab bar skeleton */}
        <div className="mt-5 flex gap-6 border-b border-gray-200 pb-2.5">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-16" />
        </div>
        {/* Content skeleton */}
        <div className="mt-6 space-y-4">
          <SkeletonCard>
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          </SkeletonCard>
          <SkeletonCard>
            <Skeleton className="h-3 w-24 mb-3" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-14 rounded-full" />
            </div>
          </SkeletonCard>
        </div>
      </div>
    )
  }

  if (!coach) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="py-12 text-center text-sm text-gray-400">코치를 찾을 수 없습니다</div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/coaches"
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            &larr;
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-[#333]">{coach.name}</h1>
            <span className="text-sm text-[#F57F17]">&#9733; {coach.avgRating !== null ? coach.avgRating.toFixed(1) : "0.0"}</span>
            {coach.workType && coach.workType.split(",").map((t: string) => t.trim()).filter(Boolean).map((t: string) => (
              <span key={t} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${WORK_TYPE_COLOR[t] || WORK_TYPE_COLOR._default}`}>
                {t}
              </span>
            ))}
          </div>
        </div>
        {activeTab === "profile" && (
          <div className="flex items-center gap-2">
            <Link
              href={`/coaches/${coachId}/edit`}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
            >
              수정
            </Link>
            <button
              onClick={() => {
                setShowDeleteDialog(true)
                setConfirmEmail("")
                setDeleteError("")
              }}
              className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
            >
              삭제
            </button>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="mt-5 border-b border-gray-200">
        <div className="flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key)
                window.history.replaceState(null, "", `?tab=${tab.key}`)
              }}
              className={`cursor-pointer border-b-2 pb-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "border-[#1976D2] text-[#1976D2]"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="mt-6">
        {activeTab === "profile" && (
          <ProfileTab
            coach={coach}
            onCoachUpdate={(updates) => setCoach((prev) => prev ? { ...prev, ...updates } : prev)}
          />
        )}
        {activeTab === "schedule" && (
          <ScheduleTab
            coachId={coachId}
            engagements={coach.engagements}
            engagementSchedules={coach.engagementSchedules}
            availabilityDetail={coach.availabilityDetail}
          />
        )}
        {activeTab === "engagement" && (
          <EngagementTab coachId={coachId} currentManagerName={managerName} isAdmin={managerRole === "admin"} />
        )}
        {/* 문서는 프로필 탭 안에 포함 */}
      </div>

      {/* Delete confirmation dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h4 className="text-sm font-semibold text-[#333]">코치 삭제</h4>
            <p className="mt-2 text-sm text-gray-600">
              정말 삭제하시겠습니까? 확인을 위해 <strong>{coach.name}</strong>을(를) 입력해주세요.
            </p>
            {deleteError && (
              <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                {deleteError}
              </div>
            )}
            <input
              type="text"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder={coach.name}
              className="mt-3 w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:border-[#1976D2]"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteDialog(false)}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
