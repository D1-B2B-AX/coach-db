"use client"

import { useRouter } from "next/navigation"
import { ReactNode } from "react"
import { Skeleton } from "@/components/Skeleton"

interface CoachField {
  id: string
  name: string
}

export interface CoachListItem {
  id: string
  name: string
  phone: string | null
  email: string | null
  status: string
  workType?: string | null
  fields: CoachField[]
  avgRating: number | null
  workDays?: number
}

interface CoachListTableProps {
  coaches: CoachListItem[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: () => void
  allSelected: boolean
  loading: boolean
  sortBy?: string
  onSortChange?: (sort: string) => void
  search?: string
  onSearchChange?: (v: string) => void
  onExport?: (type: "phone" | "email") => void
  exporting?: boolean
  filterSlot?: ReactNode
}

const WORK_TYPE_COLOR: Record<string, string> = {
  "실습코치": "bg-[#F3E5F5] text-[#7B1FA2]",
  "운영조교": "bg-[#E0F2F1] text-[#00695C]",
  "삼전 DS": "bg-[#FFF3E0] text-[#E65100]",
  "삼전 DX": "bg-[#E3F2FD] text-[#0D47A1]",
  _default: "bg-[#E8EAF6] text-[#283593]",
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: {
    label: "활동중",
    className: "bg-[#E3F2FD] text-[#1976D2]",
  },
  inactive: {
    label: "비활동",
    className: "bg-[#FBE9E7] text-[#D84315]",
  },
}

function renderRating(rating: number | null) {
  if (rating === null) return <span className="text-gray-300">-</span>
  return (
    <span className="text-[#F57F17]">
      &#9733; {rating.toFixed(1)}
    </span>
  )
}

export default function CoachListTable({
  coaches,
  selectedIds,
  onToggle,
  onToggleAll,
  allSelected,
  loading,
  sortBy,
  onSortChange,
  search,
  onSearchChange,
  onExport,
  exporting,
  filterSlot,
}: CoachListTableProps) {
  const router = useRouter()

  if (loading) {
    return (
      <div className="overflow-hidden rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100">
        <div className="hidden sm:grid grid-cols-[auto_84px_120px_110px_180px_minmax(32px,1fr)_64px_48px] items-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-400">
          <div className="w-4" /><div>이름</div><div>근무유형</div><div>연락처</div><div>이메일</div><div>분야</div><div>누적 근무일</div><div>평가</div>
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="grid grid-cols-[auto_84px_120px_110px_180px_minmax(32px,1fr)_64px_48px] items-center gap-3 px-4 py-3 border-b border-gray-100">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-4 w-8" />
          </div>
        ))}
      </div>
    )
  }

  if (coaches.length === 0) {
    return (
      <div className="rounded-2xl bg-white px-5 py-12 text-center text-base text-gray-400 shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100">
        검색 조건에 맞는 코치가 없습니다
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100">
      {/* Top bar: filters + search + actions */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-100 px-5 py-2.5">
        {filterSlot}
        {selectedIds.size > 0 && onExport && (
          <>
            <span className="text-xs text-gray-500">{selectedIds.size}명 선택</span>
            <button
              onClick={() => onExport("phone")}
              disabled={exporting}
              className="cursor-pointer rounded-md bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              전화번호
            </button>
            <button
              onClick={() => onExport("email")}
              disabled={exporting}
              className="cursor-pointer rounded-md bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              이메일
            </button>
          </>
        )}
        {!filterSlot && <div className="flex-1" />}
        {onSearchChange && (
          <div className="relative">
            <svg className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" /></svg>
            <input
              type="text"
              value={search || ""}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="검색"
              className="w-36 rounded-md border-0 bg-gray-50 py-1.5 pl-7 pr-2 text-xs text-gray-600 placeholder:text-gray-300 focus:bg-white focus:ring-1 focus:ring-[#1976D2] focus:outline-none transition-all"
            />
          </div>
        )}
      </div>
      {/* Table header */}
      <div className="hidden sm:grid grid-cols-[auto_84px_120px_110px_180px_minmax(32px,1fr)_64px_48px] items-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-400">
        <div className="w-4 flex items-center justify-center">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onToggleAll}
            className="h-4 w-4 rounded border-gray-300 accent-[#1976D2]"
          />
        </div>
        <div>이름</div>
        <div>근무유형</div>
        <div>연락처</div>
        <div>이메일</div>
        <div>분야</div>
        <div className="whitespace-nowrap">누적 근무일</div>
        <div>평가</div>
      </div>

      {/* Coach rows */}
      <div>
        {coaches.map((coach) => {
          const statusCfg = STATUS_CONFIG[coach.status] || STATUS_CONFIG.inactive
          const isSelected = selectedIds.has(coach.id)

          return (
            <div
              key={coach.id}
              onClick={() => router.push(`/coaches/${coach.id}`)}
              className={`grid grid-cols-[auto_1fr] sm:grid-cols-[auto_84px_120px_110px_180px_minmax(32px,1fr)_64px_48px] items-center gap-3 px-4 py-3 border-b border-gray-100 transition-colors hover:bg-gray-50 cursor-pointer ${
                isSelected ? "bg-[#E3F2FD]/50" : ""
              }`}
            >
              {/* Checkbox */}
              <div className="w-4 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(coach.id)}
                  className="h-4 w-4 rounded border-gray-300 accent-[#1976D2]"
                />
              </div>

              {/* Name + status dot */}
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm font-medium text-[#333] truncate">{coach.name}</span>
                <span className={`shrink-0 inline-block h-2 w-2 rounded-full ${coach.status === "active" ? "bg-[#4CAF50]" : "bg-gray-300"}`} />
              </div>

              {/* Work Type */}
              <div className="hidden sm:flex flex-wrap gap-0.5">
                {coach.workType ? coach.workType.split(",").map(t => t.trim()).filter(Boolean).map(t => (
                  <span key={t} className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${WORK_TYPE_COLOR[t] || WORK_TYPE_COLOR._default}`}>{t}</span>
                )) : <span className="text-xs text-gray-300">-</span>}
              </div>

              {/* Phone */}
              <span
                className={`hidden sm:block text-sm text-gray-500 truncate ${coach.phone ? "cursor-pointer hover:text-[#1976D2] active:text-[#1565C0]" : ""}`}
                onClick={coach.phone ? (e) => { e.preventDefault(); e.stopPropagation(); navigator.clipboard.writeText(coach.phone!); const el = e.currentTarget; el.dataset.orig = el.textContent || ""; el.textContent = "복사됨!"; setTimeout(() => { el.textContent = el.dataset.orig || "" }, 1000) } : undefined}
              >
                {coach.phone || "-"}
              </span>

              {/* Email */}
              <span
                className={`hidden sm:block text-xs text-gray-500 truncate ${coach.email ? "cursor-pointer hover:text-[#1976D2] active:text-[#1565C0]" : ""}`}
                onClick={coach.email ? (e) => { e.preventDefault(); e.stopPropagation(); navigator.clipboard.writeText(coach.email!); const el = e.currentTarget; el.dataset.orig = el.textContent || ""; el.textContent = "복사됨!"; setTimeout(() => { el.textContent = el.dataset.orig || "" }, 1000) } : undefined}
              >
                {coach.email || "-"}
              </span>

              {/* Fields */}
              <span className="hidden sm:block text-xs text-gray-500 truncate">
                {coach.fields.length > 0
                  ? coach.fields.map((f) => f.name).join(", ")
                  : "-"}
              </span>

              {/* Work days */}
              <span className="hidden sm:block text-sm">
                {(coach.workDays ?? 0) > 0 ? (
                  <span className="text-gray-600">{coach.workDays}일</span>
                ) : (
                  <span className="text-gray-300">-</span>
                )}
              </span>

              {/* Rating */}
              <span className="hidden sm:block text-sm">
                {renderRating(coach.avgRating)}
              </span>

              {/* Mobile: fields */}
              <span className="col-start-2 text-xs text-gray-500 sm:hidden">
                {coach.fields.length > 0
                  ? coach.fields.map((f) => f.name).join(", ")
                  : ""}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
