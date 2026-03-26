"use client"

import { useRouter } from "next/navigation"
import { ReactNode } from "react"

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

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: {
    label: "활동중",
    className: "bg-[#E3F2FD] text-[#1976D2]",
  },
  inactive: {
    label: "비활동",
    className: "bg-[#FBE9E7] text-[#D84315]",
  },
  on_leave: {
    label: "휴직",
    className: "bg-[#FFF8E1] text-[#F57F17]",
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
      <div className="rounded-2xl bg-white px-5 py-12 text-center text-base text-gray-400 shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100">
        불러오는 중...
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
    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100">
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
      <div className="hidden sm:grid grid-cols-[auto_80px_120px_1fr_72px_56px] items-center gap-4 border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-400">
        <div className="w-4 flex items-center justify-center">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onToggleAll}
            className="h-4 w-4 rounded border-gray-300 accent-[#1976D2]"
          />
        </div>
        <div>이름</div>
        <div>연락처</div>
        <div>분야</div>
        <div>최근 근무일</div>
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
              className={`grid grid-cols-[auto_1fr] sm:grid-cols-[auto_80px_120px_1fr_72px_56px] items-center gap-4 px-4 py-3 border-b border-gray-100 transition-colors hover:bg-gray-50 cursor-pointer ${
                isSelected ? "bg-[#E3F2FD]/20" : ""
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

              {/* Name */}
              <span className="text-sm font-medium text-[#333] truncate">
                {coach.name}
                {coach.status === "active" && (
                  <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[#4CAF50]" />
                )}
              </span>

              {/* Phone */}
              <span className="hidden sm:block text-sm text-gray-500 truncate">
                {coach.phone || "-"}
              </span>

              {/* Fields */}
              <span className="hidden sm:block text-sm text-gray-500 truncate">
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
