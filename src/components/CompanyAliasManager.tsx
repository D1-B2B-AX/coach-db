"use client"

import { useState, useEffect, useCallback } from "react"

interface CompanyAlias {
  id: string
  companyName: string
  alias: string
}

export default function CompanyAliasManager() {
  const [aliases, setAliases] = useState<CompanyAlias[]>([])
  const [aliasLoading, setAliasLoading] = useState(true)
  const [aliasError, setAliasError] = useState<string | null>(null)
  const [newCompanyName, setNewCompanyName] = useState("")
  const [newAlias, setNewAlias] = useState("")
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editCompanyName, setEditCompanyName] = useState("")
  const [editAlias, setEditAlias] = useState("")
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchAliases = useCallback(async () => {
    try {
      const res = await fetch("/api/company-aliases")
      if (res.ok) {
        const data = await res.json()
        setAliases(data.aliases || [])
      }
    } catch { /* ignore */ }
    finally { setAliasLoading(false) }
  }, [])

  useEffect(() => { fetchAliases() }, [fetchAliases])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newCompanyName.trim() || !newAlias.trim()) return
    setAdding(true)
    setAliasError(null)
    try {
      const res = await fetch("/api/company-aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: newCompanyName.trim(), alias: newAlias.trim() }),
      })
      if (res.ok) {
        setNewCompanyName("")
        setNewAlias("")
        fetchAliases()
      } else if (res.status === 409) {
        setAliasError("이미 등록된 회사명입니다.")
      }
    } catch { /* ignore */ }
    finally { setAdding(false) }
  }

  function startEdit(a: CompanyAlias) {
    setEditingId(a.id)
    setEditCompanyName(a.companyName)
    setEditAlias(a.alias)
    setAliasError(null)
  }

  async function handleSave(id: string) {
    setSaving(true)
    setAliasError(null)
    try {
      const res = await fetch(`/api/company-aliases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: editCompanyName.trim(), alias: editAlias.trim() }),
      })
      if (res.ok) {
        setEditingId(null)
        fetchAliases()
      } else if (res.status === 409) {
        setAliasError("이미 등록된 회사명입니다.")
      }
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm("정말 삭제하시겠습니까?")) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/company-aliases/${id}`, { method: "DELETE" })
      if (res.ok) fetchAliases()
    } catch { /* ignore */ }
    finally { setDeletingId(null) }
  }

  return (
    <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100 overflow-hidden">
      <form onSubmit={handleAdd} className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
        <input
          type="text"
          value={newCompanyName}
          onChange={(e) => setNewCompanyName(e.target.value)}
          placeholder="회사명"
          className="flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-[#333] placeholder:text-gray-300 focus:border-[#1976D2] focus:outline-none"
        />
        <input
          type="text"
          value={newAlias}
          onChange={(e) => setNewAlias(e.target.value)}
          placeholder="별칭"
          className="w-28 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-[#333] placeholder:text-gray-300 focus:border-[#1976D2] focus:outline-none"
        />
        <button
          type="submit"
          disabled={adding || !newCompanyName.trim() || !newAlias.trim()}
          className="cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium bg-[#1976D2] text-white hover:bg-[#1565C0] transition-colors disabled:opacity-50"
        >
          {adding ? "..." : "추가"}
        </button>
      </form>
      {aliasError && (
        <div className="px-4 py-2 text-xs text-red-500 bg-red-50">{aliasError}</div>
      )}
      {aliasLoading ? (
        <div className="p-4 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : aliases.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-gray-400">
          등록된 매핑이 없습니다. 추가해 주세요.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-x-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-[11px] font-semibold text-gray-400">
            <div>회사명</div>
            <div>별칭</div>
            <div>수정</div>
            <div>삭제</div>
          </div>
          {aliases.map((a) => (
            <div key={a.id} className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-x-3 px-4 py-2.5 border-b border-gray-100 last:border-0 hover:bg-gray-50">
              {editingId === a.id ? (
                <>
                  <input
                    type="text"
                    value={editCompanyName}
                    onChange={(e) => setEditCompanyName(e.target.value)}
                    className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-[#333] focus:border-[#1976D2] focus:outline-none"
                  />
                  <input
                    type="text"
                    value={editAlias}
                    onChange={(e) => setEditAlias(e.target.value)}
                    className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-[#333] focus:border-[#1976D2] focus:outline-none"
                  />
                  <button
                    onClick={() => handleSave(a.id)}
                    disabled={saving}
                    className="cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-medium bg-[#1976D2] text-white hover:bg-[#1565C0] transition-colors disabled:opacity-50"
                  >
                    {saving ? "..." : "저장"}
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="cursor-pointer rounded-full px-2.5 py-1 text-[11px] text-gray-400 hover:text-gray-600"
                  >
                    취소
                  </button>
                </>
              ) : (
                <>
                  <span className="text-xs text-[#333] truncate">{a.companyName}</span>
                  <span className="text-xs text-gray-500 truncate">{a.alias}</span>
                  <button
                    onClick={() => startEdit(a)}
                    className="cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-medium bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => handleDelete(a.id)}
                    disabled={deletingId === a.id}
                    className="cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-medium bg-red-50 text-red-400 hover:bg-red-100 transition-colors disabled:opacity-50"
                  >
                    {deletingId === a.id ? "..." : "삭제"}
                  </button>
                </>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
