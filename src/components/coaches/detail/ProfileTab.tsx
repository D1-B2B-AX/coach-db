"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"

interface DocItem {
  id: string
  fileUrl: string
  fileName: string
  fileType: string
}

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
  managerNote: string | null
  accessToken: string
  fields: { id: string; name: string }[]
  curriculums: { id: string; name: string }[]
  avgRating: number | null
}

interface ProfileTabProps {
  coach: CoachDetail
  onCoachUpdate: (updates: Partial<CoachDetail>) => void
  isAdmin?: boolean
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-"
  const d = new Date(dateStr)
  return d.toLocaleDateString("ko-KR")
}

export default function ProfileTab({ coach, onCoachUpdate, isAdmin }: ProfileTabProps) {
  const [editingSelfNote, setEditingSelfNote] = useState(false)
  const [editingManagerNote, setEditingManagerNote] = useState(false)
  const [selfNote, setSelfNote] = useState(coach.selfNote ?? "")
  const [managerNote, setManagerNote] = useState(coach.managerNote ?? "")
  const [savingField, setSavingField] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [docs, setDocs] = useState<DocItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [showTokenConfirm, setShowTokenConfirm] = useState(false)

  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch(`/api/coaches/${coach.id}/documents`)
      if (res.ok) {
        const data = await res.json()
        setDocs(data.documents || [])
      }
    } catch { /* silently fail */ }
  }, [coach.id])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  async function saveNote(field: "selfNote" | "managerNote", value: string) {
    setSavingField(field)
    try {
      const res = await fetch(`/api/coaches/${coach.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      })
      if (res.ok) {
        const updated = await res.json()
        onCoachUpdate({ ...coach, ...updated })
        if (field === "selfNote") setEditingSelfNote(false)
        if (field === "managerNote") setEditingManagerNote(false)
      }
    } catch {
      // silently fail
    } finally {
      setSavingField(null)
    }
  }

  function getCoachLink() {
    if (typeof window === "undefined") return ""
    return `${window.location.origin}/coach?token=${coach.accessToken}`
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(getCoachLink())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }

  return (
    <div className="space-y-5">
      {/* Basic info */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100 space-y-3">
        {/* Key info — responsive grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <InfoItem label="연락처" value={coach.phone || "-"} />
          <InfoItem label="이메일" value={coach.email || "-"} />
          <InfoItem label="생년월일" value={formatDate(coach.birthDate) || "-"} />
          <InfoItem label="사번" value={coach.employeeId || "-"} />
          <InfoItem label="소속" value={coach.affiliation || "-"} />
          {/* Portfolio — inline in the grid */}
          <div className="flex items-baseline gap-2 py-1">
            <span className="shrink-0 w-14 text-sm text-gray-400">파일</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {coach.portfolioUrl && (
                <a
                  href={coach.portfolioUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <svg className="h-3 w-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                  이력서/포트폴리오
                </a>
              )}
              {docs.map((doc) => (
                <div key={doc.id} className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-sm">
                  <svg className="h-3 w-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                  <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-gray-900 transition-colors">
                    {doc.fileName}
                  </a>
                  <button
                    onClick={async () => { await fetch(`/api/documents/${doc.id}`, { method: "DELETE" }); fetchDocs() }}
                    className="cursor-pointer text-gray-300 hover:text-red-500 transition-colors"
                  >✕</button>
                </div>
              ))}
              {docs.length < 5 && (
              <label className="inline-flex cursor-pointer items-center rounded-full border border-dashed border-gray-300 px-2.5 py-0.5 text-sm text-gray-400 hover:border-[#1976D2] hover:text-[#1976D2] transition-colors">
                <span>{uploading ? "업로드 중..." : "+ 추가"}</span>
                <input
                  type="file"
                  className="hidden"
                  disabled={uploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    if (docs.length >= 5) {
                      alert("파일은 최대 5개까지 업로드할 수 있습니다.")
                      e.target.value = ""
                      return
                    }
                    if (file.size > 10 * 1024 * 1024) {
                      alert("파일 크기가 10MB를 초과합니다.")
                      e.target.value = ""
                      return
                    }
                    setUploading(true)
                    const formData = new FormData()
                    formData.append("file", file)
                    formData.append("fileType", "portfolio")
                    try {
                      const res = await fetch(`/api/coaches/${coach.id}/documents`, { method: "POST", body: formData })
                      if (!res.ok) {
                        const data = await res.json().catch(() => null)
                        alert(data?.error || "업로드에 실패했습니다.")
                      } else {
                        fetchDocs()
                      }
                    } catch {
                      alert("업로드에 실패했습니다.")
                    }
                    finally { setUploading(false); e.target.value = "" }
                  }}
                />
              </label>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Fields & Curriculums — separate block */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100">
        <div className="space-y-3">
          <div>
            <span className="text-sm font-medium text-gray-400">가능 분야</span>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {coach.fields.length > 0 ? (
                coach.fields.map((f) => (
                  <span key={f.id} className="rounded-full bg-[#E3F2FD] px-2.5 py-0.5 text-sm font-medium text-[#1976D2]">
                    {f.name}
                  </span>
                ))
              ) : (
                <span className="text-sm text-gray-300">-</span>
              )}
            </div>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-400">가능 커리큘럼</span>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {coach.curriculums.length > 0 ? (
                coach.curriculums.map((c) => (
                  <span key={c.id} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-sm font-medium text-gray-600">
                    {c.name}
                  </span>
                ))
              ) : (
                <span className="text-sm text-gray-300">-</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100">
        <div className="space-y-4">
          {/* Self note */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">특이사항 / 히스토리</span>
              {!editingSelfNote && (
                <button
                  onClick={() => {
                    setSelfNote(coach.selfNote ?? "")
                    setEditingSelfNote(true)
                  }}
                  className="text-sm text-[#1976D2] hover:text-[#1565C0] transition-colors cursor-pointer"
                >
                  수정
                </button>
              )}
            </div>
            {editingSelfNote ? (
              <div className="mt-1.5">
                <textarea
                  value={selfNote}
                  onChange={(e) => setSelfNote(e.target.value)}
                  rows={3}
                  className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-base text-gray-900 focus:border-[#1976D2] focus:outline-none"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => saveNote("selfNote", selfNote)}
                    disabled={savingField === "selfNote"}
                    className="cursor-pointer rounded-lg bg-[#1976D2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1565C0] disabled:opacity-50"
                  >
                    {savingField === "selfNote" ? "저장 중..." : "저장"}
                  </button>
                  <button
                    onClick={() => setEditingSelfNote(false)}
                    className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-1 whitespace-pre-wrap text-sm text-[#333]">
                {coach.selfNote || "-"}
              </p>
            )}
          </div>

          <div className="h-px bg-gray-100" />

          {/* Manager note */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">메모</span>
              {!editingManagerNote && (
                <button
                  onClick={() => {
                    setManagerNote(coach.managerNote ?? "")
                    setEditingManagerNote(true)
                  }}
                  className="text-sm text-[#1976D2] hover:text-[#1565C0] transition-colors cursor-pointer"
                >
                  수정
                </button>
              )}
            </div>
            {editingManagerNote ? (
              <div className="mt-1.5">
                <textarea
                  value={managerNote}
                  onChange={(e) => setManagerNote(e.target.value)}
                  rows={3}
                  className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-base text-gray-900 focus:border-[#1976D2] focus:outline-none"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => saveNote("managerNote", managerNote)}
                    disabled={savingField === "managerNote"}
                    className="cursor-pointer rounded-lg bg-[#1976D2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1565C0] disabled:opacity-50"
                  >
                    {savingField === "managerNote" ? "저장 중..." : "저장"}
                  </button>
                  <button
                    onClick={() => setEditingManagerNote(false)}
                    className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-1 whitespace-pre-wrap text-sm text-[#333]">
                {coach.managerNote || "-"}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Audit logs */}
      <AuditLogSection coachId={coach.id} />
    </div>
  )
}

function formatAuditValue(val: string | null): string {
  if (!val) return "(빈 값)"
  // ISO date → YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}T/.test(val)) return val.split("T")[0]
  return val
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 py-1">
      <span className="shrink-0 w-14 text-sm text-gray-400">{label}</span>
      <span className="text-[#333] break-all">{value}</span>
    </div>
  )
}

// ─── Audit Log Section ───

interface AuditLog {
  id: string
  tableName: string
  recordId: string
  action: string
  field: string | null
  oldValue: string | null
  newValue: string | null
  changedBy: string
  createdAt: string
}

const FIELD_LABELS: Record<string, string> = {
  name: "이름",
  birthDate: "생년월일",
  phone: "연락처",
  email: "이메일",
  affiliation: "소속",
  workType: "근무유형",
  status: "상태",
  selfNote: "특이사항 / 히스토리",
  managerNote: "메모",
  fields: "가능 분야",
  curriculums: "가능 커리큘럼",
  courseName: "코스명",
  startDate: "시작일",
  endDate: "종료일",
  startTime: "시작 시각",
  endTime: "종료 시각",
  location: "장소",
  rating: "평점",
  feedback: "피드백",
  rehire: "재고용",
  hiredBy: "담당자",
}

const ACTION_LABELS: Record<string, string> = {
  create: "생성",
  update: "수정",
  delete: "삭제",
}

function AuditLogSection({ coachId }: { coachId: string }) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch(`/api/coaches/${coachId}/audit-logs`)
      .then((r) => r.json())
      .then((d) => setLogs(d.logs || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [coachId, open])

  return (
    <div className="rounded-2xl bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center justify-between text-sm font-semibold text-gray-400"
      >
        수정 이력
        <span className="text-sm">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-3">
          {loading ? (
            <div className="py-4 text-center text-sm text-gray-400">불러오는 중...</div>
          ) : logs.length === 0 ? (
            <div className="py-4 text-center text-sm text-gray-400">수정 이력이 없습니다</div>
          ) : (
            <div className="space-y-1">
              {logs.map((log) => (
                <div key={log.id} className="flex items-baseline gap-2 px-1 py-1 text-sm">
                  <span className="shrink-0 text-xs text-gray-400">
                    {new Date(log.createdAt).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}{" "}
                    {new Date(log.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="shrink-0 font-medium text-gray-500">
                    {(log as any).changedByName || log.changedBy.split("@")[0]}
                  </span>
                  <span className="text-gray-400">
                    {log.action === "delete" ? (
                      <span className="text-red-500">삭제</span>
                    ) : log.action === "create" ? (
                      <span className="text-[#1976D2]">
                        {log.tableName === "engagements" ? "투입 이력 생성" : "생성"}
                      </span>
                    ) : (
                      <>
                        {FIELD_LABELS[log.field || ""] || log.field}{" "}
                        <span className="line-through">{formatAuditValue(log.oldValue)}</span>
                        {" → "}
                        <span className="text-[#333]">{formatAuditValue(log.newValue)}</span>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
