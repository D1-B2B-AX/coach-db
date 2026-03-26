"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
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
  const [managers, setManagers] = useState<Manager[]>([])
  const [deletedCoaches, setDeletedCoaches] = useState<DeletedCoach[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [activeTab, setActiveTab] = useState<"managers" | "deleted" | "links" | "sync">("managers")
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
    } catch { /* silently fail */ }
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      await Promise.all([fetchManagers(), fetchDeletedCoaches()])
      setLoading(false)
    }
    load()
  }, [fetchManagers, fetchDeletedCoaches])

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
    } catch { /* silently fail */ }
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
        setToastMessage(`삼성 일정 동기화 완료: ${data.created}건 생성`)
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
    { key: "managers" as const, label: `매니저 관리 (${managers.length})` },
    { key: "links" as const, label: "코치 관리" },
    { key: "deleted" as const, label: `코치 삭제 내역 (${deletedCoaches.length})` },
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
                        } catch { /* silently fail */ }
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

        {/* Sync tab */}
        {activeTab === "sync" && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-[#333]">데이터 동기화</h3>
              <p className="mt-2 text-sm text-gray-500">
                구글시트에서 삼성전자 SW학부 교육과정 스케줄을 가져옵니다. 기존 삼성 일정은 삭제 후 새로 생성됩니다.
              </p>
              <button
                onClick={handleSamsungSync}
                disabled={syncLoading}
                className="mt-4 cursor-pointer rounded-lg bg-[#1976D2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1565C0] disabled:opacity-50 transition-colors"
              >
                {syncLoading ? "동기화 중..." : "삼성 일정 동기화"}
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

    } catch { /* silently fail */ }
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

  const allCoaches = [
    ...(data.completedCoaches || []),
    ...(data.accessedOnlyCoaches || []),
    ...(data.notAccessedCoaches || []),
  ]

  const cards = [
    { key: "completed", label: "입력완료", count: data.status.completed, chipColor: "bg-[#E8F5E9] text-[#2E7D32]", activeColor: "bg-[#2E7D32] text-white", list: data.completedCoaches || [] },
    { key: "accessedOnly", label: "접속만", count: data.status.accessedOnly, chipColor: "bg-[#FFF8E1] text-[#F57F17]", activeColor: "bg-[#F57F17] text-white", list: data.accessedOnlyCoaches || [] },
    { key: "notAccessed", label: "미확인", count: data.status.notAccessed, chipColor: "bg-[#FBE9E7] text-[#D84315]", activeColor: "bg-[#D84315] text-white", list: data.notAccessedCoaches || [] },
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
    } catch { /* silently fail */ }
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
            >{copiedCell === `link-${c.id}` ? "복사됨!" : (getLink(c.id) || "-")}</span>
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
