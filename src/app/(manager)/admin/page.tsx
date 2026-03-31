"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useEscClose } from "@/lib/useEscClose"
import Toast from "@/components/Toast"

interface Manager {
  id: string
  email: string
  name: string
  role: string
  createdAt: string
}

interface DeletedCoach {
  id: string
  name: string
  phone: string | null
  email: string | null
  affiliation: string | null
  status: string
  deletedAt: string
  deletedBy: string | null
}

const ROLE_CONFIG: Record<string, { label: string; className: string }> = {
  admin: { label: "관리자", className: "bg-[#E8F5E9] text-[#2E7D32]" },
  user: { label: "일반", className: "bg-[#E3F2FD] text-[#1976D2]" },
  blocked: { label: "차단", className: "bg-[#FBE9E7] text-[#D84315]" },
}

export default function AdminPage() {
  const router = useRouter()
  const [managers, setManagers] = useState<Manager[]>([])
  const [deletedCoaches, setDeletedCoaches] = useState<DeletedCoach[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [activeTab, setActiveTab] = useState<"managers" | "applications" | "deleted" | "links" | "sync">("links")
  const [search, setSearch] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [managerFilter, setManagerFilter] = useState<string | null>("all")
  const [confirmAction, setConfirmAction] = useState<{ type: "restore" | "permanentDelete"; coach: DeletedCoach } | null>(null)
  const [bulkDeleteAction, setBulkDeleteAction] = useState<"restore" | "permanentDelete" | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [deletedSelectedIds, setDeletedSelectedIds] = useState<Set<string>>(new Set())
  const [syncLoading, setSyncLoading] = useState(false)
  const [toastMessage, setToastMessage] = useState("")
  const [showToast, setShowToast] = useState(false)
  const [pendingCoaches, setPendingCoaches] = useState<any[]>([])
  const [appSyncLoading, setAppSyncLoading] = useState(false)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [expandedAppId, setExpandedAppId] = useState<string | null>(null)
  const [appNotes, setAppNotes] = useState<Record<string, string>>({})
  const [savingAppNote, setSavingAppNote] = useState<string | null>(null)

  useEscClose(confirmAction !== null, () => setConfirmAction(null))

  const fetchManagers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/managers")
      if (res.status === 403) {
        setError("관리자 권한이 필요합니다")
        return
      }
      if (res.ok) {
        const data = await res.json()
        setManagers(data.managers || [])
      }
    } catch {
      setError("데이터를 불러올 수 없습니다")
    }
  }, [])

  const fetchDeletedCoaches = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/deleted-coaches")
      if (res.ok) {
        const data = await res.json()
        setDeletedCoaches(data.coaches || [])
      }
    } catch (err) { console.error("Failed to fetch deleted coaches:", err) }
  }, [])

  const fetchPendingCoaches = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/applications")
      if (res.ok) {
        const data = await res.json()
        setPendingCoaches((data.coaches || []).sort((a: any, b: any) => a.name.localeCompare(b.name, 'ko')))
      }
    } catch (err) { console.error("Failed to fetch pending coaches:", err) }
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      await Promise.all([fetchManagers(), fetchDeletedCoaches(), fetchPendingCoaches()])
      setLoading(false)
    }
    load()
  }, [fetchManagers, fetchDeletedCoaches, fetchPendingCoaches])

  // Filter managers by preset + search
  const filteredManagers = useMemo(() => {
    let list = managers
    if (managerFilter && managerFilter !== "all") {
      list = list.filter((m) => m.role === managerFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
      )
    }
    return list
  }, [managers, managerFilter, search])

  const managerRoleCounts = useMemo(() => ({
    all: managers.length,
    admin: managers.filter((m) => m.role === "admin").length,
    user: managers.filter((m) => m.role === "user").length,
    blocked: managers.filter((m) => m.role === "blocked").length,
  }), [managers])

  const filteredDeleted = useMemo(() => {
    if (!search.trim()) return deletedCoaches
    const q = search.toLowerCase()
    return deletedCoaches.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q)
    )
  }, [deletedCoaches, search])

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelectedIds((prev) => {
      if (prev.size === filteredManagers.length) return new Set()
      return new Set(filteredManagers.map((m) => m.id))
    })
  }

  async function handleRoleChange(managerId: string, newRole: string) {
    const res = await fetch("/api/admin/managers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: managerId, role: newRole }),
    })
    if (res.ok) {
      fetchManagers()
    } else {
      const data = await res.json()
      alert(data.error || "변경 실패")
    }
  }

  async function handleBulkRoleChange(newRole: string) {
    const ids = [...selectedIds]
    for (const id of ids) {
      await fetch("/api/admin/managers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, role: newRole }),
      })
    }
    setSelectedIds(new Set())
    fetchManagers()
  }

  async function handleConfirmAction() {
    if (!confirmAction) return
    setActionLoading(true)
    try {
      if (confirmAction.type === "restore") {
        await fetch("/api/admin/deleted-coaches", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: confirmAction.coach.id }),
        })
      } else {
        await fetch("/api/admin/deleted-coaches", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: confirmAction.coach.id }),
        })
      }
      fetchDeletedCoaches()
    } catch (err) { console.error("Failed to process coach action:", err) }
    finally {
      setActionLoading(false)
      setConfirmAction(null)
    }
  }

  async function handleSamsungSync() {
    if (!confirm('삼성 일정을 새로 가져올까요? 기존 삼성 일정은 삭제 후 재생성됩니다.')) return
    setSyncLoading(true)
    try {
      const res = await fetch('/api/sync/samsung-schedule', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setToastMessage(`DS 일정 동기화 완료: ${data.created}건 생성`)
      } else {
        setToastMessage(`동기화 실패: ${data.error}`)
      }
    } catch {
      setToastMessage('동기화 중 오류 발생')
    } finally {
      setSyncLoading(false)
      setShowToast(true)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="py-12 text-center text-sm text-gray-400">불러오는 중...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="py-12 text-center text-sm text-red-500">{error}</div>
      </div>
    )
  }

  const TABS = [
    { key: "links" as const, label: "일정 등록 링크" },
    { key: "applications" as const, label: `코치 신청${pendingCoaches.length > 0 ? ` (${pendingCoaches.length})` : ""}` },
    { key: "deleted" as const, label: `삭제 내역 (${deletedCoaches.length})` },
    { key: "managers" as const, label: `매니저 (${managers.length})` },
    { key: "sync" as const, label: "동기화" },
  ]

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      {/* Tabs */}
      <div className="mt-5 border-b border-gray-200">
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setSearch(""); setSelectedIds(new Set()) }}
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

      <div className="mt-6">
        {/* Managers tab */}
        {activeTab === "managers" && (
          <div className="space-y-4">
            {/* Preset chips + search */}
            <div className="flex items-center gap-2">
              {([
                { key: "all", label: "전체", color: "bg-gray-100 text-gray-500", activeColor: "bg-[#333] text-white" },
                { key: "admin", label: "관리자", color: "bg-[#E8F5E9] text-[#2E7D32]", activeColor: "bg-[#2E7D32] text-white" },
                { key: "user", label: "일반", color: "bg-[#E3F2FD] text-[#1976D2]", activeColor: "bg-[#1976D2] text-white" },
                { key: "blocked", label: "차단", color: "bg-[#FBE9E7] text-[#D84315]", activeColor: "bg-[#D84315] text-white" },
              ] as const).map((preset) => (
                <button
                  key={preset.key}
                  onClick={() => { setManagerFilter(preset.key); setSelectedIds(new Set()) }}
                  className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    managerFilter === preset.key ? preset.activeColor : preset.color
                  }`}
                >
                  {preset.label} ({managerRoleCounts[preset.key]})
                </button>
              ))}
            </div>

            <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100">
              {/* Search + select all + bulk action */}
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-2.5">
                <div className="flex items-center gap-3">
                  {selectedIds.size > 0 && (
                    <span className="text-sm text-gray-500">{selectedIds.size}명 선택</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {selectedIds.size > 0 && (
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          handleBulkRoleChange(e.target.value)
                          e.target.value = ""
                        }
                      }}
                      className="appearance-none cursor-pointer rounded-md bg-gray-50 px-3 py-1.5 pr-7 text-sm font-medium text-gray-700 focus:outline-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%239CA3AF%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_0.5rem_center] bg-[length:0.875rem]"
                    >
                      <option value="" disabled>일괄 변경</option>
                      <option value="admin">관리자</option>
                      <option value="user">일반</option>
                      <option value="blocked">차단</option>
                    </select>
                  )}
                  <div className="relative">
                    <svg className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" /></svg>
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="검색"
                      className="w-36 rounded-md border-0 bg-gray-50 py-1.5 pl-7 pr-2 text-sm text-gray-600 placeholder:text-gray-300 focus:bg-white focus:ring-1 focus:ring-[#1976D2] focus:outline-none transition-all"
                    />
                  </div>
                </div>
              </div>
              {/* Table header */}
              <div className="grid grid-cols-[auto_80px_1fr_80px] items-center gap-5 border-b border-gray-200 bg-gray-50 px-5 py-2.5 text-xs font-semibold text-gray-400">
                <div className="w-4 flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredManagers.length && filteredManagers.length > 0}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-gray-300 accent-[#1976D2]"
                  />
                </div>
                <div>이름</div>
                <div>이메일</div>
                <div>역할</div>
              </div>

              {filteredManagers.map((m) => {
                const roleCfg = ROLE_CONFIG[m.role] || ROLE_CONFIG.user
                return (
                  <div
                    key={m.id}
                    className={`grid grid-cols-[auto_80px_1fr_80px] items-center gap-5 border-b border-gray-100 px-5 py-2.5 last:border-0 ${
                      selectedIds.has(m.id) ? "bg-[#E3F2FD]/20" : ""
                    }`}
                  >
                    <div className="w-4 flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(m.id)}
                        onChange={() => toggleId(m.id)}
                        className="h-4 w-4 rounded border-gray-300 accent-[#1976D2]"
                      />
                    </div>
                    <span className="text-sm font-medium text-[#333] truncate">{m.name}</span>
                    <span className="text-sm text-gray-500 truncate">{m.email}</span>
                    <select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.id, e.target.value)}
                      className={`appearance-none cursor-pointer rounded-full border border-transparent px-3 py-1 pr-6 text-xs font-semibold transition-colors hover:border-gray-200 ${roleCfg.className} bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%239CA3AF%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_0.35rem_center] bg-[length:0.75rem] focus:outline-none`}
                    >
                      <option value="admin">관리자</option>
                      <option value="user">일반</option>
                      <option value="blocked">차단</option>
                    </select>
                  </div>
                )
              })}
              {filteredManagers.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-gray-400">
                  {search ? "검색 결과가 없습니다" : "등록된 매니저가 없습니다"}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Deleted coaches tab */}
        {activeTab === "deleted" && (
          <>
            <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100 overflow-hidden">
              {/* Action bar */}
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-2.5">
                <div className="flex items-center gap-3">
                  {deletedSelectedIds.size > 0 && (
                    <>
                      <span className="text-sm text-gray-500">{deletedSelectedIds.size}명 선택</span>
                      <button
                        onClick={() => setBulkDeleteAction("restore")}
                        className="cursor-pointer rounded-md bg-gray-50 px-3 py-1.5 text-sm font-medium text-[#1976D2] hover:bg-gray-100 transition-colors"
                      >
                        복원
                      </button>
                      <button
                        onClick={() => setBulkDeleteAction("permanentDelete")}
                        className="cursor-pointer rounded-md bg-gray-50 px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
                      >
                        완전 삭제
                      </button>
                    </>
                  )}
                </div>
                <div className="relative">
                  <svg className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" /></svg>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="검색"
                    className="w-36 rounded-md border-0 bg-gray-50 py-1.5 pl-7 pr-2 text-sm text-gray-600 placeholder:text-gray-300 focus:bg-white focus:ring-1 focus:ring-[#1976D2] focus:outline-none transition-all"
                  />
                </div>
              </div>
              {/* Table header */}
              <div className="grid grid-cols-[auto_72px_110px_minmax(0,1fr)_72px_80px] items-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-400">
                <div className="w-4 flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={filteredDeleted.length > 0 && filteredDeleted.every((c) => deletedSelectedIds.has(c.id))}
                    onChange={() => {
                      setDeletedSelectedIds((prev) => {
                        const allSelected = filteredDeleted.every((c) => prev.has(c.id))
                        if (allSelected) return new Set()
                        return new Set(filteredDeleted.map((c) => c.id))
                      })
                    }}
                    className="h-4 w-4 rounded border-gray-300 accent-[#1976D2]"
                  />
                </div>
                <div>이름</div>
                <div>휴대폰</div>
                <div>이메일</div>
                <div>삭제자</div>
                <div>삭제일</div>
              </div>
              {filteredDeleted.map((c) => (
                <div
                  key={c.id}
                  className={`grid grid-cols-[auto_72px_110px_minmax(0,1fr)_72px_80px] items-center gap-3 border-b border-gray-100 px-4 py-2.5 last:border-0 ${deletedSelectedIds.has(c.id) ? "bg-[#E3F2FD]/20" : ""}`}
                >
                  <div className="w-4 flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={deletedSelectedIds.has(c.id)}
                      onChange={() => {
                        setDeletedSelectedIds((prev) => {
                          const next = new Set(prev)
                          if (next.has(c.id)) next.delete(c.id)
                          else next.add(c.id)
                          return next
                        })
                      }}
                      className="h-4 w-4 rounded border-gray-300 accent-[#1976D2]"
                    />
                  </div>
                  <span className="text-sm font-medium text-[#333] truncate">{c.name}</span>
                  <span className="text-sm text-gray-500 truncate">{c.phone || "-"}</span>
                  <span className="text-sm text-gray-500 truncate">{c.email || "-"}</span>
                  <span className="text-sm text-gray-400 truncate">
                    {c.deletedBy ? (managers.find((m) => m.email === c.deletedBy)?.name || c.deletedBy.split("@")[0]) : "-"}
                  </span>
                  <span className="text-sm text-gray-400">
                    {new Date(c.deletedAt!).toLocaleDateString("ko-KR")}
                  </span>
                </div>
              ))}
              {filteredDeleted.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-gray-400">
                  {search ? "검색 결과가 없습니다" : "삭제된 코치가 없습니다"}
                </div>
              )}
            </div>

            {/* Bulk confirm dialog */}
            {bulkDeleteAction && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
                  <h4 className="text-sm font-semibold text-[#333]">
                    {bulkDeleteAction === "restore" ? "복원" : "완전 삭제"}
                  </h4>
                  <p className="mt-2 text-sm text-gray-600">
                    {deletedSelectedIds.size}명을 {bulkDeleteAction === "restore" ? "복원" : "완전 삭제"}하시겠습니까?
                    {bulkDeleteAction === "permanentDelete" && " 이 작업은 되돌릴 수 없습니다."}
                  </p>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      onClick={() => setBulkDeleteAction(null)}
                      className="cursor-pointer rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                    >
                      취소
                    </button>
                    <button
                      onClick={async () => {
                        setActionLoading(true)
                        try {
                          for (const id of deletedSelectedIds) {
                            const coach = deletedCoaches.find((c) => c.id === id)
                            if (!coach) continue
                            if (bulkDeleteAction === "restore") {
                              await fetch("/api/admin/deleted-coaches", {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ coachId: coach.id }),
                              })
                            } else {
                              await fetch("/api/admin/deleted-coaches", {
                                method: "DELETE",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ coachId: coach.id }),
                              })
                            }
                          }
                          setDeletedSelectedIds(new Set())
                          setBulkDeleteAction(null)
                          // Re-fetch
                          const res = await fetch("/api/admin/deleted-coaches")
                          if (res.ok) {
                            const data = await res.json()
                            setDeletedCoaches(data.coaches || [])
                          }
                        } catch (err) { console.error("Failed to bulk action:", err) }
                        finally { setActionLoading(false) }
                      }}
                      disabled={actionLoading}
                      className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                        bulkDeleteAction === "restore" ? "bg-[#1976D2] hover:bg-[#1565C0]" : "bg-red-600 hover:bg-red-700"
                      }`}
                    >
                      {actionLoading ? "처리 중..." : bulkDeleteAction === "restore" ? "복원" : "삭제"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Confirm dialog */}
            {confirmAction && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
                  <h4 className="text-sm font-semibold text-[#333]">
                    {confirmAction.type === "restore" ? "코치 복원" : "완전 삭제"}
                  </h4>
                  <p className="mt-2 text-sm text-gray-600">
                    {confirmAction.type === "restore"
                      ? `${confirmAction.coach.name} 코치를 복원하시겠습니까?`
                      : `${confirmAction.coach.name} 코치를 완전히 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
                  </p>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      onClick={() => setConfirmAction(null)}
                      className="cursor-pointer rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleConfirmAction}
                      disabled={actionLoading}
                      className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                        confirmAction.type === "restore"
                          ? "bg-[#1976D2] hover:bg-[#1565C0]"
                          : "bg-red-600 hover:bg-red-700"
                      }`}
                    >
                      {actionLoading ? "처리 중..." : confirmAction.type === "restore" ? "복원" : "완전 삭제"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Coach management tab */}
        {activeTab === "links" && (
          <CoachManagementTab />
        )}

        {/* Applications tab */}
        {activeTab === "applications" && (
          <div className="space-y-4">
            {pendingCoaches.length === 0 ? (
              <div className="rounded-2xl bg-white px-5 py-12 text-center text-sm text-gray-400 shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100">
                대기 중인 신청이 없습니다
              </div>
            ) : (
              <div className="space-y-3">
                {pendingCoaches.map((coach: any) => {
                  const isExpanded = expandedAppId === coach.id
                  const noteLines = (coach.selfNote || "").split("\n").filter(Boolean)
                  return (
                    <div
                      key={coach.id}
                      className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100 overflow-hidden"
                    >
                      {/* Card header — always visible */}
                      <div
                        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50/50 transition-colors"
                        onClick={() => setExpandedAppId(isExpanded ? null : coach.id)}
                      >
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-[#333]">{coach.name}</span>
                            {coach.workType && (() => {
                              const types: string[] = []
                              if (coach.workType.includes("운영조교")) types.push("운영조교")
                              if (coach.workType.includes("실습코치")) types.push("실습코치")
                              return types.map((t: string) => (
                                <span key={t} className="rounded-full bg-[#F3E5F5] px-2 py-0.5 text-[11px] font-medium text-[#7B1FA2]">{t}</span>
                              ))
                            })()}
                            <span className="text-xs text-gray-500">{coach.phone}</span>
                            {coach.createdAt && (
                              <span className="text-[11px] text-gray-500">{new Date(coach.createdAt).toLocaleDateString("ko-KR")}</span>
                            )}
                          </div>
                          {coach.fields?.length > 0 && (
                            <div className="flex items-baseline gap-1.5">
                              <span className="shrink-0 text-[10px] text-gray-400">교육/가능 분야</span>
                              <div className="flex flex-wrap gap-1">
                                {coach.fields.map((f: string) => (
                                  <span key={f} className="rounded-full bg-[#E3F2FD] px-2 py-0.5 text-[10px] font-medium text-[#1976D2]">{f}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {coach.curriculums?.length > 0 && (
                            <div className="flex items-baseline gap-1.5">
                              <span className="shrink-0 text-[10px] text-gray-400">보유 스킬</span>
                              <div className="flex flex-wrap gap-1">
                                {coach.curriculums.map((c: string) => (
                                  <span key={c} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">{c}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-4" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={async () => {
                              const res = await fetch(`/api/admin/applications/${coach.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ action: "approve" }),
                              })
                              if (res.ok) {
                                router.push(`/coaches/${coach.id}/edit`)
                              }
                            }}
                            className="cursor-pointer rounded-lg bg-[#E8F5E9] px-3 py-1.5 text-xs font-semibold text-[#2E7D32] hover:bg-[#C8E6C9] transition-colors"
                          >
                            승인
                          </button>
                          <button
                            onClick={() => { setRejectId(coach.id); setRejectReason("") }}
                            className="cursor-pointer rounded-lg bg-[#FBE9E7] px-3 py-1.5 text-xs font-semibold text-[#D84315] hover:bg-[#FFCCBC] transition-colors"
                          >
                            거절
                          </button>
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 bg-gray-50/30 px-5 py-4 space-y-1.5">
                          <AppDetailRow label="이메일" value={coach.email} />
                          <AppDetailRow label="생년월일" value={coach.birthDate ? new Date(coach.birthDate).toLocaleDateString("ko-KR") : null} />
                          <AppDetailRow label="소속" value={coach.affiliation} />
                          <AppDetailRow label="근무 가능 기간" value={coach.availabilityDetail} />
                          {noteLines.map((line: string, i: number) => {
                            const match = line.match(/^\[(.+?)\]\s*(.*)$/)
                            if (match) return <AppDetailRow key={i} label={match[1]} value={match[2]} />
                            return <AppDetailRow key={i} label="" value={line} />
                          })}
                          {coach.documents?.length > 0 && (
                            <div className="flex gap-2">
                              <span className="shrink-0 w-28 text-xs text-gray-400">포트폴리오</span>
                              <div className="flex flex-wrap gap-1.5">
                                {coach.documents.flatMap((d: any, di: number) => {
                                  const urls = d.fileUrl.match(/https?:\/\/[^\s,]+/g) || [d.fileUrl]
                                  return urls.map((url: string, ui: number) => (
                                    <a key={`${di}-${ui}`} href={url.trim()} target="_blank" rel="noopener noreferrer" className="text-xs text-[#1976D2] hover:underline">
                                      {urls.length > 1 ? `${d.fileName} (${ui + 1})` : d.fileName}
                                    </a>
                                  ))
                                })}
                              </div>
                            </div>
                          )}
                          {/* Manager memo */}
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <span className="text-xs text-gray-400">메모</span>
                            <textarea
                              value={appNotes[coach.id] ?? coach.managerNote ?? ""}
                              onChange={(e) => setAppNotes(prev => ({ ...prev, [coach.id]: e.target.value }))}
                              placeholder="면접 일정, 참고사항 등"
                              rows={2}
                              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-[#333] focus:outline-none focus:border-[#1976D2]"
                            />
                            {(appNotes[coach.id] !== undefined && appNotes[coach.id] !== (coach.managerNote ?? "")) && (
                              <button
                                onClick={async () => {
                                  setSavingAppNote(coach.id)
                                  const note = appNotes[coach.id]?.trim() || null
                                  try {
                                    const res = await fetch(`/api/coaches/${coach.id}`, {
                                      method: "PUT",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ managerNote: note }),
                                    })
                                    if (res.ok) {
                                      setToastMessage("메모 저장 완료")
                                      setShowToast(true)
                                      fetchPendingCoaches()
                                    }
                                  } finally {
                                    setSavingAppNote(null)
                                  }
                                }}
                                disabled={savingAppNote === coach.id}
                                className="mt-1.5 cursor-pointer rounded-md bg-[#1976D2] px-3 py-1 text-[11px] font-semibold text-white hover:bg-[#1565C0] disabled:opacity-50 transition-colors"
                              >
                                {savingAppNote === coach.id ? "저장 중..." : "메모 저장"}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Reject dialog */}
            {rejectId && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
                  <h4 className="text-sm font-semibold text-[#333]">신청 거절</h4>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="거절 사유 (선택)"
                    rows={3}
                    className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1976D2]"
                  />
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      onClick={() => setRejectId(null)}
                      className="cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      취소
                    </button>
                    <button
                      onClick={async () => {
                        const res = await fetch(`/api/admin/applications/${rejectId}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "reject", reason: rejectReason || undefined }),
                        })
                        if (res.ok) {
                          setToastMessage("거절 완료")
                          setShowToast(true)
                          setRejectId(null)
                          fetchPendingCoaches()
                        }
                      }}
                      className="cursor-pointer rounded-xl bg-[#D84315] px-4 py-2 text-sm font-semibold text-white hover:bg-[#BF360C] transition-colors"
                    >
                      거절
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "sync" && (
          <div className="space-y-4">
            {/* 코치 신청 동기화 */}
            <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-[#333]">코치 신청 동기화</h3>
              <p className="mt-2 text-sm text-gray-500">
                구글폼 응답 시트에서 신규 코치 신청을 가져옵니다.
              </p>
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={async () => {
                    setAppSyncLoading(true)
                    try {
                      const res = await fetch("/api/sync/applications", { method: "POST" })
                      const data = await res.json()
                      if (res.ok) {
                        setToastMessage(`동기화 완료: ${data.created}건 생성, ${data.updated || 0}건 업데이트, ${data.skipped}건 스킵`)
                        setShowToast(true)
                        fetchPendingCoaches()
                      } else {
                        setToastMessage(`동기화 실패: ${data.error}`)
                        setShowToast(true)
                      }
                    } catch {
                      setToastMessage("동기화 중 오류 발생")
                      setShowToast(true)
                    } finally {
                      setAppSyncLoading(false)
                    }
                  }}
                  disabled={appSyncLoading}
                  className="cursor-pointer rounded-lg bg-[#1976D2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1565C0] disabled:opacity-50 transition-colors"
                >
                  {appSyncLoading ? "동기화 중..." : "구글폼 동기화"}
                </button>
                <a href="https://docs.google.com/forms/d/e/1FAIpQLSc6Mt8e1n0mOLEeiDiVVbNZvUFcRWJzHcyzH7a8LE5vib_4fA/viewform" target="_blank" rel="noopener noreferrer" className="text-xs text-[#1976D2] hover:underline">구글폼</a>
                <a href="https://docs.google.com/spreadsheets/d/1xrkRqw3niREpZRIYuB6cEjOGm7Y45bEWkqP02vESR20" target="_blank" rel="noopener noreferrer" className="text-xs text-[#1976D2] hover:underline">구글폼 응답시트</a>
              </div>
            </div>

            {/* 삼성전자 일정 동기화 */}
            <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-[#333]">삼성전자 일정 동기화</h3>
              <p className="mt-2 text-sm text-gray-500">
                구글시트에서 삼성전자 SW학부 교육과정 스케줄을 가져옵니다. 기존 삼성 일정은 삭제 후 새로 생성됩니다.
              </p>
              <button
                onClick={handleSamsungSync}
                disabled={syncLoading}
                className="mt-3 cursor-pointer rounded-lg bg-[#1976D2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1565C0] disabled:opacity-50 transition-colors"
              >
                {syncLoading ? "동기화 중..." : "DS 일정 동기화"}
              </button>
            </div>
          </div>
        )}
      </div>

      <Toast
        message={toastMessage}
        show={showToast}
        onClose={() => setShowToast(false)}
      />
    </div>
  )
}

// ─── Coach Management Tab ───

function firstEmail(raw: string | null): string {
  if (!raw) return ""
  const match = raw.match(/[\w.+-]+@[\w.-]+\.\w+/)
  return match ? match[0] : raw.trim()
}

function CoachManagementTab() {
  const [data, setData] = useState<any>(null)
  const [emailMap, setEmailMap] = useState<Map<string, string>>(new Map())
  const [phoneMap, setPhoneMap] = useState<Map<string, string>>(new Map())
  const [tokenMap, setTokenMap] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [selectedStatus, setSelectedStatus] = useState<string | null>("all")
  const [selectedCoachIds, setSelectedCoachIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [copiedEmails, setCopiedEmails] = useState(false)
  const [copiedCell, setCopiedCell] = useState<string | null>(null)

  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const yearMonth = `${now.getFullYear()}-${String(currentMonth).padStart(2, "0")}`

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, coachRes, linksRes] = await Promise.all([
        fetch(`/api/schedules/${yearMonth}/status`),
        fetch("/api/coaches?limit=500"),
        fetch("/api/admin/coach-links"),
      ])
      const statusData = statusRes.ok ? await statusRes.json() : null
      const coachData = coachRes.ok ? await coachRes.json() : null
      const linksData = linksRes.ok ? await linksRes.json() : null

      if (statusData) setData(statusData)

      const eMap = new Map<string, string>()
      const pMap = new Map<string, string>()
      for (const c of coachData?.coaches || []) {
        if (c.email) eMap.set(c.id, firstEmail(c.email))
        if (c.phone) pMap.set(c.id, c.phone)
      }
      setEmailMap(eMap)
      setPhoneMap(pMap)

      const tMap = new Map<string, string>()
      for (const c of linksData?.coaches || []) {
        if (c.accessToken) tMap.set(c.id, c.accessToken)
      }
      setTokenMap(tMap)

    } catch (err) { console.error("Failed to fetch send-links data:", err) }
    finally { setLoading(false) }
  }, [yearMonth, currentMonth])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return <div className="py-12 text-center text-sm text-gray-400">불러오는 중...</div>
  }

  if (!data) {
    return <div className="py-12 text-center text-sm text-gray-400">데이터를 불러올 수 없습니다</div>
  }

  const total = data.status.notAccessed + data.status.accessedOnly + data.status.completed

  const sortByName = (list: any[]) => [...list].sort((a: any, b: any) => a.name.localeCompare(b.name, 'ko'))

  const allCoaches = sortByName([
    ...(data.completedCoaches || []),
    ...(data.accessedOnlyCoaches || []),
    ...(data.notAccessedCoaches || []),
  ])

  const cards = [
    { key: "completed", label: "입력완료", count: data.status.completed, chipColor: "bg-[#E8F5E9] text-[#2E7D32]", activeColor: "bg-[#2E7D32] text-white", list: sortByName(data.completedCoaches || []) },
    { key: "accessedOnly", label: "접속만", count: data.status.accessedOnly, chipColor: "bg-[#FFF8E1] text-[#F57F17]", activeColor: "bg-[#F57F17] text-white", list: sortByName(data.accessedOnlyCoaches || []) },
    { key: "notAccessed", label: "미확인", count: data.status.notAccessed, chipColor: "bg-[#FBE9E7] text-[#D84315]", activeColor: "bg-[#D84315] text-white", list: sortByName(data.notAccessedCoaches || []) },
    { key: "all", label: "전체", count: total, chipColor: "bg-gray-100 text-gray-500", activeColor: "bg-[#333] text-white", list: allCoaches },
  ]

  const selectedCard = cards.find(c => c.key === selectedStatus)

  const mailCoaches = selectedCoachIds.size > 0 && selectedCard
    ? selectedCard.list.filter((c: any) => selectedCoachIds.has(c.id))
    : []
  const mailEmails = mailCoaches
    .map((c: any) => emailMap.get(c.id))
    .filter(Boolean)
    .join("; ")

  function toggleCoachId(id: string) {
    setSelectedCoachIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllInList() {
    const list = selectedCard ? selectedCard.list : allCoaches
    const listIds = list.map((c: any) => c.id)
    const allSelected = listIds.every((id: string) => selectedCoachIds.has(id))
    setSelectedCoachIds((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        listIds.forEach((id: string) => next.delete(id))
      } else {
        listIds.forEach((id: string) => next.add(id))
      }
      return next
    })
  }

  function getLink(coachId: string) {
    const token = tokenMap.get(coachId)
    return token ? `${window.location.origin}/coach?token=${token}` : ""
  }

  async function copyCell(key: string, text: string) {
    if (!text || text === "-") return
    await navigator.clipboard.writeText(text)
    setCopiedCell(key)
    setTimeout(() => setCopiedCell(null), 1500)
  }

  async function copyEmails() {
    await navigator.clipboard.writeText(mailEmails)
    setCopiedEmails(true)
    setTimeout(() => setCopiedEmails(false), 2000)
  }

  async function exportMailMerge() {
    const ids = selectedCoachIds.size > 0 && selectedCard
      ? selectedCard.list.filter((c: any) => selectedCoachIds.has(c.id)).map((c: any) => c.id)
      : selectedCard ? selectedCard.list.map((c: any) => c.id) : []
    if (ids.length === 0) return

    try {
      const res = await fetch("/api/coaches/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coachIds: ids,
          type: "mail-merge",
          baseUrl: window.location.origin,
        }),
      })
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `mail-merge_${yearMonth}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) { console.error("Failed to download mail-merge:", err) }
  }

  const filteredByStatus = selectedCard ? selectedCard.list : allCoaches
  const visibleCoaches = search.trim()
    ? filteredByStatus.filter((c: any) => {
        const q = search.toLowerCase()
        return c.name.toLowerCase().includes(q) || (emailMap.get(c.id) || "").toLowerCase().includes(q) || (phoneMap.get(c.id) || "").includes(q)
      })
    : filteredByStatus

  return (
    <div className="space-y-4">
      {/* Preset filter chips + search */}
      <div className="flex items-center gap-2">
        {cards.map((card) => (
          <button
            key={card.key}
            onClick={() => {
              setSelectedStatus(card.key)
              setSelectedCoachIds(new Set())
            }}
            className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              selectedStatus === card.key ? card.activeColor : card.chipColor
            }`}
          >
            {card.label} ({card.count})
          </button>
        ))}
      </div>

      {/* Coach table — always visible */}
      <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
          <div className="flex items-center gap-3">
            {selectedCoachIds.size > 0 && (
              <span className="text-sm text-gray-500">{selectedCoachIds.size}명 선택</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedCoachIds.size > 0 && (
              <>
                <button
                  onClick={copyEmails}
                  className="cursor-pointer rounded-md bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  {copiedEmails ? "복사됨!" : "수신인 복사"}
                </button>
                <button
                  onClick={exportMailMerge}
                  className="cursor-pointer rounded-md bg-[#E3F2FD] px-3 py-1.5 text-sm font-medium text-[#1976D2] hover:bg-[#BBDEFB] transition-colors"
                >
                  메일머지용 엑셀 내보내기
                </button>
              </>
            )}
            <div className="relative">
              <svg className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" /></svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="검색"
                className="w-36 rounded-md border-0 bg-gray-50 py-1.5 pl-7 pr-2 text-sm text-gray-600 placeholder:text-gray-300 focus:bg-white focus:ring-1 focus:ring-[#1976D2] focus:outline-none transition-all"
              />
            </div>
          </div>
        </div>
        {/* Table header */}
        <div className="grid grid-cols-[auto_72px_120px_200px_1fr] items-center gap-5 border-b border-gray-200 bg-gray-50 px-5 py-2.5 text-xs font-semibold text-gray-400">
          <div className="w-4">
            <input
              type="checkbox"
              checked={visibleCoaches.length > 0 && visibleCoaches.every((c: any) => selectedCoachIds.has(c.id))}
              onChange={toggleAllInList}
              className="h-4 w-4 rounded border-gray-300 accent-[#1976D2]"
            />
          </div>
          <div>이름</div>
          <div>휴대폰</div>
          <div>이메일</div>
          <div>개인 링크</div>
        </div>
        {/* Rows */}
        {visibleCoaches.map((c: any) => (
          <div key={c.id} className={`grid grid-cols-[auto_72px_120px_200px_1fr] items-center gap-5 border-b border-gray-100 px-5 py-2.5 last:border-0 ${selectedCoachIds.has(c.id) ? "bg-[#E3F2FD]/20" : ""}`}>
            <div className="w-4 flex items-center justify-center">
              <input
                type="checkbox"
                checked={selectedCoachIds.has(c.id)}
                onChange={() => toggleCoachId(c.id)}
                className="h-4 w-4 rounded border-gray-300 accent-[#1976D2]"
              />
            </div>
            <span
              title={c.name}
              onClick={(e) => { e.stopPropagation(); copyCell(`name-${c.id}`, c.name) }}
              className="text-sm font-medium text-[#333] truncate cursor-pointer hover:text-[#1976D2] transition-colors"
            >{copiedCell === `name-${c.id}` ? "복사됨!" : c.name}</span>
            <span
              title={phoneMap.get(c.id) || ""}
              onClick={(e) => { e.stopPropagation(); copyCell(`phone-${c.id}`, phoneMap.get(c.id) || "") }}
              className="text-sm text-gray-500 truncate cursor-pointer hover:text-[#1976D2] transition-colors"
            >{copiedCell === `phone-${c.id}` ? "복사됨!" : (phoneMap.get(c.id) || "-")}</span>
            <span
              title={emailMap.get(c.id) || ""}
              onClick={(e) => { e.stopPropagation(); copyCell(`email-${c.id}`, emailMap.get(c.id) || "") }}
              className="text-sm text-gray-500 truncate cursor-pointer hover:text-[#1976D2] transition-colors"
            >{copiedCell === `email-${c.id}` ? "복사됨!" : (emailMap.get(c.id) || "-")}</span>
            <span
              title={getLink(c.id)}
              onClick={(e) => { e.stopPropagation(); copyCell(`link-${c.id}`, getLink(c.id)) }}
              className="text-sm text-gray-400 truncate cursor-pointer hover:text-[#1976D2] transition-colors"
            >{copiedCell === `link-${c.id}` ? "복사됨!" : (() => { const link = getLink(c.id); if (!link) return "-"; const token = tokenMap.get(c.id) || ""; return token.length > 12 ? `https://....${token.slice(-8)}` : link })()}</span>
          </div>
        ))}
        {visibleCoaches.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-gray-400">
            해당 코치가 없습니다
          </div>
        )}
      </div>
    </div>
  )
}

function AppDetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex gap-2">
      <span className="shrink-0 w-28 text-xs text-gray-400">{label}</span>
      <span className="text-xs text-[#333] whitespace-pre-wrap">{value}</span>
    </div>
  )
}

function AppDetailBlock({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <span className="text-[10px] text-gray-400">{label}</span>
      <div className="mt-0.5 text-xs text-[#333] whitespace-pre-wrap">{value}</div>
    </div>
  )
}
