"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import CoachListTable from "@/components/coaches/CoachListTable"
import type { CoachListItem } from "@/components/coaches/CoachListTable"

interface FieldOption {
  id: string
  name: string
}

const STATUS_OPTIONS = [
  { value: "", label: "전체" },
  { value: "active", label: "활동중" },
  { value: "inactive", label: "비활동" },
  { value: "on_leave", label: "휴직" },
]

export default function CoachesPage() {
  const [search, setSearch] = useState("")
  const [fieldFilter, setFieldFilter] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState("")
  const [coaches, setCoaches] = useState<CoachListItem[]>([])
  const [total, setTotal] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [fields, setFields] = useState<FieldOption[]>([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [sortBy, setSortBy] = useState("workDays")
  const [workTypeFilter, setWorkTypeFilter] = useState<Set<string>>(new Set())

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState("")

  // Debounce search input (300ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search])

  // Fetch master fields on mount
  useEffect(() => {
    async function fetchFields() {
      try {
        const res = await fetch("/api/master/fields")
        if (res.ok) {
          const data = await res.json()
          setFields(data.fields || [])
        }
      } catch {
        // silently fail
      }
    }
    fetchFields()
  }, [])

  // Fetch coaches when filters change
  const fetchCoaches = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set("search", debouncedSearch)
      if (statusFilter) params.set("status", statusFilter)
      params.set("limit", "500")

      const res = await fetch(`/api/coaches?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        const coachList = data.coaches || []
        setCoaches(coachList)
        setTotal(data.total || 0)
        // Initialize filters with all values on first load
        if (workTypeFilter.size === 0) {
          const types = new Set<string>()
          for (const c of coachList) {
            if (c.workType) c.workType.split(",").forEach((t: string) => { const trimmed = t.trim(); if (trimmed) types.add(trimmed) })
          }
          setWorkTypeFilter(types)
        }
        // fieldFilter는 빈 상태 = 전체 표시, 선택 시 해당 분야만 필터
        // Clear selections that are no longer in the results
        setSelectedIds((prev) => {
          const currentIds = new Set((data.coaches || []).map((c: CoachListItem) => c.id))
          const next = new Set<string>()
          for (const id of prev) {
            if (currentIds.has(id)) next.add(id)
          }
          return next
        })
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, statusFilter])

  useEffect(() => {
    fetchCoaches()
  }, [fetchCoaches])

  // Selection handlers
  function handleToggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function handleToggleAll() {
    if (selectedIds.size === sortedCoaches.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sortedCoaches.map((c) => c.id)))
    }
  }

  // Excel export
  async function handleExport(type: "phone" | "email") {
    if (selectedIds.size === 0) return
    setExporting(true)
    try {
      const res = await fetch("/api/coaches/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachIds: Array.from(selectedIds), type }),
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        const label = type === "email" ? "emails" : "phones"
        a.download = `coaches_${label}_${new Date().toISOString().slice(0, 10)}.xlsx`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      }
    } catch {
      // silently fail
    } finally {
      setExporting(false)
    }
  }

  // All unique values for filters
  const allWorkTypes = Array.from(
    new Set(coaches.flatMap((c) => c.workType ? c.workType.split(",").map((t) => t.trim()).filter(Boolean) : []))
  ).sort()

  const allFieldNames = Array.from(
    new Set(coaches.flatMap((c) => c.fields.map((f) => f.name)))
  ).sort()

  // Client-side filtering: workType + field
  const filtered = coaches.filter((c) => {
    // Work type filter
    if (workTypeFilter.size > 0 && workTypeFilter.size < allWorkTypes.length) {
      if (!c.workType) return false
      const types = c.workType.split(",").map((t) => t.trim())
      if (!types.some((t) => workTypeFilter.has(t))) return false
    }
    // Field filter
    if (fieldFilter.size > 0) {
      if (c.fields.length === 0) return false
      if (!c.fields.some((f) => fieldFilter.has(f.name))) return false
    }
    return true
  })

  const sortedCoaches = sortBy === "workDays"
    ? [...filtered].sort((a, b) => ((b as any).workDays ?? 0) - ((a as any).workDays ?? 0) || (b.avgRating ?? 0) - (a.avgRating ?? 0))
    : sortBy === "rating"
    ? [...filtered].sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0) || ((b as any).workDays ?? 0) - ((a as any).workDays ?? 0))
    : sortBy === "nameDesc"
    ? [...filtered].reverse()
    : filtered

  const allSelected = sortedCoaches.length > 0 && selectedIds.size === sortedCoaches.length

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* Coach list table */}
      <div>
        <CoachListTable
          coaches={sortedCoaches}
          selectedIds={selectedIds}
          onToggle={handleToggle}
          onToggleAll={handleToggleAll}
          allSelected={allSelected}
          loading={loading}
          sortBy={sortBy}
          onSortChange={setSortBy}
          search={search}
          onSearchChange={setSearch}
          onExport={handleExport}
          exporting={exporting}
          filterSlot={
            <>
              <FieldMultiSelect
                types={allFieldNames}
                selected={fieldFilter}
                onChange={setFieldFilter}
              />
              <WorkTypeMultiSelect
                types={allWorkTypes}
                selected={workTypeFilter}
                onChange={setWorkTypeFilter}
              />
              <span className="text-gray-200">|</span>
              <SortSelect value={sortBy} onChange={setSortBy} />
              <div className="flex-1" />
              <Link
                href="/coaches/new"
                className="shrink-0 rounded-full bg-[#1976D2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1565C0] transition-colors"
              >
                + 등록
              </Link>
            </>
          }
        />
      </div>
    </div>
  )
}

// ─── Sort Select Dropdown ───

const SORT_OPTIONS = [
  { value: "", label: "이름순" },
  { value: "nameDesc", label: "이름 역순" },
  { value: "workDays", label: "최근 6개월 누적 근무일 많은 순" },
  { value: "rating", label: "평가 높은 순" },
]

function SortSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const current = SORT_OPTIONS.find((o) => o.value === value)
  const isActive = value !== ""

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
          isActive
            ? "border-[#1976D2] bg-[#E3F2FD] text-[#1976D2]"
            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
        }`}
      >
        {current?.label ?? "정렬"} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-52 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className={`w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                  value === opt.value ? "font-semibold text-[#1976D2]" : "text-[#333]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Field Multi Select Dropdown ───

function FieldMultiSelect({
  types,
  selected,
  onChange,
}: {
  types: string[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const count = types.filter((t) => selected.has(t)).length
  const isFiltered = count > 0 && count < types.length

  function toggle(t: string) {
    const next = new Set(selected)
    if (next.has(t)) next.delete(t)
    else next.add(t)
    onChange(next)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
          isFiltered
            ? "border-[#1976D2] bg-[#E3F2FD] text-[#1976D2]"
            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
        }`}
      >
        가능 분야{isFiltered ? ` (${count})` : ""} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded-xl border border-gray-200 bg-white py-1 shadow-lg max-h-64 overflow-y-auto">
            {types.map((t) => (
              <label
                key={t}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(t)}
                  onChange={() => toggle(t)}
                  className="h-3.5 w-3.5 rounded accent-[#1976D2]"
                />
                <span className="text-sm text-[#333]">{t}</span>
              </label>
            ))}
            {count > 0 && (
              <button
                onClick={() => { onChange(new Set()); setOpen(false) }}
                className="w-full cursor-pointer border-t border-gray-100 px-3 py-2 text-left text-sm text-gray-400 hover:text-gray-600"
              >
                초기화
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Work Type Multi Select ───

function WorkTypeMultiSelect({
  types,
  selected,
  onChange,
}: {
  types: string[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const allSelected = types.length > 0 && types.every((t) => selected.has(t))
  const count = types.filter((t) => selected.has(t)).length
  const isFiltered = count > 0 && count < types.length

  function toggle(t: string) {
    const next = new Set(selected)
    if (next.has(t)) next.delete(t)
    else next.add(t)
    onChange(next)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
          isFiltered
            ? "border-[#1976D2] bg-[#E3F2FD] text-[#1976D2]"
            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
        }`}
      >
        근무유형{isFiltered ? ` (${count})` : ""} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
            {types.map((t) => (
              <label
                key={t}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(t)}
                  onChange={() => toggle(t)}
                  className="h-3.5 w-3.5 rounded accent-[#1976D2]"
                />
                <span className="text-sm text-[#333]">{t}</span>
              </label>
            ))}
            {count > 0 && (
              <button
                onClick={() => { onChange(new Set()); setOpen(false) }}
                className="w-full cursor-pointer border-t border-gray-100 px-3 py-2 text-left text-sm text-gray-400 hover:text-gray-600"
              >
                초기화
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
