"use client"

import { useRouter } from "next/navigation"
import { ReactNode } from "react"
import { Skeleton } from "@/components/Skeleton"
import Badge from "@/components/ui/Badge"
import Button from "@/components/ui/Button"
import { Table, TableHeader, TableRow, TableEmpty } from "@/components/ui/Table"
import { TABLE_DIVIDER_COLOR } from "@/components/ui/styles"

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

const WORK_TYPE_TONE: Record<string, "purple" | "teal" | "amber" | "blue" | "gray"> = {
  "실습코치": "purple",
  "운영조교": "teal",
  "삼전 DS": "amber",
  "삼전 DX": "blue",
  _default: "gray",
}

const STATUS_CONFIG: Record<string, { label: string; tone: "green" | "gray" }> = {
  active: {
    label: "활동중",
    tone: "green",
  },
  inactive: {
    label: "비활동",
    tone: "gray",
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
      <Table>
        <TableHeader className="hidden sm:grid grid-cols-[auto_128px_112px_104px_168px_minmax(32px,1fr)_64px_48px]">
          <div className="w-4" /><div>이름</div><div>근무유형</div><div>연락처</div><div>이메일</div><div>분야</div><div>누적 근무일</div><div>평가</div>
        </TableHeader>
        {Array.from({ length: 8 }).map((_, i) => (
          <TableRow key={i} className="grid grid-cols-[auto_128px_112px_104px_168px_minmax(32px,1fr)_64px_48px]">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-4 w-8" />
          </TableRow>
        ))}
      </Table>
    )
  }

  if (coaches.length === 0) {
    return (
      <Table>
        <TableEmpty className="text-base">검색 조건에 맞는 코치가 없습니다</TableEmpty>
      </Table>
    )
  }

  return (
    <Table>
      {/* Top bar: filters + search + actions */}
      <div className={`flex flex-wrap items-center gap-1.5 border-b ${TABLE_DIVIDER_COLOR} px-5 py-2.5`}>
        {filterSlot}
        {selectedIds.size > 0 && onExport && (
          <>
            <span className="text-xs text-gray-500">{selectedIds.size}명 선택</span>
            <Button
              onClick={() => onExport("phone")}
              disabled={exporting}
              variant="secondary"
              size="sm"
              className="rounded-lg px-3 py-1.5 text-xs font-medium"
            >
              전화번호
            </Button>
            <Button
              onClick={() => onExport("email")}
              disabled={exporting}
              variant="secondary"
              size="sm"
              className="rounded-lg px-3 py-1.5 text-xs font-medium"
            >
              이메일
            </Button>
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
              className="w-36 rounded-lg border border-gray-300 bg-gray-50 py-1.5 pl-7 pr-2 text-xs text-gray-600 placeholder:text-gray-400 focus:border-[#1976D2] focus:bg-white focus:outline-none transition-all"
            />
          </div>
        )}
      </div>
      {/* Table header */}
      <TableHeader className="hidden sm:grid grid-cols-[auto_128px_112px_104px_168px_minmax(32px,1fr)_64px_48px]">
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
      </TableHeader>

      {/* Coach rows */}
      <div>
        {coaches.map((coach) => {
          const statusCfg = STATUS_CONFIG[coach.status] || STATUS_CONFIG.inactive
          const isSelected = selectedIds.has(coach.id)

          return (
            <TableRow
              key={coach.id}
              onClick={() => router.push(`/coaches/${coach.id}`)}
              className="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_128px_112px_104px_168px_minmax(32px,1fr)_64px_48px] cursor-pointer hover:bg-gray-50"
              selected={isSelected}
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
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-sm font-medium text-[#333] truncate">{coach.name}</span>
                <Badge variant="status" tone={statusCfg.tone} className="shrink-0">
                  {statusCfg.label}
                </Badge>
              </div>

              {/* Work Type */}
              <div
                className="hidden sm:flex min-w-0 flex-wrap gap-0.5"
                title={coach.workType || ""}
              >
                {coach.workType ? coach.workType.split(",").map(t => t.trim()).filter(Boolean).map(t => (
                  <Badge key={t} variant="category" tone={WORK_TYPE_TONE[t] || WORK_TYPE_TONE._default} className="shrink-0">
                    {t}
                  </Badge>
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
              <span className="hidden sm:block overflow-hidden whitespace-nowrap text-ellipsis text-xs text-gray-500" title={coach.fields.length > 0 ? coach.fields.map((f) => f.name).join(", ") : ""}>
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
              <span className="col-start-2 overflow-hidden whitespace-nowrap text-ellipsis text-xs text-gray-500 sm:hidden" title={coach.fields.length > 0 ? coach.fields.map((f) => f.name).join(", ") : ""}>
                {coach.fields.length > 0
                  ? coach.fields.map((f) => f.name).join(", ")
                  : ""}
              </span>
            </TableRow>
          )
        })}
      </div>
    </Table>
  )
}
