"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useEscClose } from "@/lib/useEscClose"

interface Document {
  id: string
  coachId: string
  fileUrl: string
  fileName: string
  fileType: string
  uploadedAt: string
}

interface DocumentTabProps {
  coachId: string
}

const FILE_TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  resume: { label: "이력서", className: "bg-[#E3F2FD] text-[#1976D2]" },
  portfolio: { label: "포트폴리오", className: "bg-[#E8F5E9] text-[#2E7D32]" },
  certificate: { label: "자격증", className: "bg-[#FFF8E1] text-[#F57F17]" },
}

const FILE_TYPE_OPTIONS = [
  { value: "resume", label: "이력서" },
  { value: "portfolio", label: "포트폴리오" },
  { value: "certificate", label: "자격증" },
]

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("ko-KR")
}

export default function DocumentTab({ coachId }: DocumentTabProps) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [selectedFileType, setSelectedFileType] = useState("resume")
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEscClose(deleteId !== null, () => setDeleteId(null))

  const fetchDocuments = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/coaches/${coachId}/documents`)
      if (res.ok) {
        const data = await res.json()
        setDocuments(data.documents || [])
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [coachId])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      setError("파일을 선택해주세요.")
      return
    }

    setUploading(true)
    setError("")

    const formData = new FormData()
    formData.append("file", file)
    formData.append("fileType", selectedFileType)

    try {
      const res = await fetch(`/api/coaches/${coachId}/documents`, {
        method: "POST",
        body: formData,
      })
      if (res.ok) {
        setShowUpload(false)
        if (fileInputRef.current) fileInputRef.current.value = ""
        fetchDocuments()
      } else {
        const data = await res.json()
        setError(data.error || "업로드에 실패했습니다.")
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.")
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/documents/${deleteId}`, {
        method: "DELETE",
      })
      if (res.ok || res.status === 204) {
        setDeleteId(null)
        fetchDocuments()
      }
    } catch {
      // silently fail
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-4 w-20 animate-pulse rounded bg-gray-100" />
          <div className="h-9 w-24 animate-pulse rounded-xl bg-gray-100" />
        </div>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100 flex items-center gap-4">
            <div className="h-4 w-40 animate-pulse rounded bg-gray-100" />
            <div className="h-5 w-14 animate-pulse rounded-full bg-gray-100" />
            <div className="flex-1" />
            <div className="h-4 w-20 animate-pulse rounded bg-gray-100" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#333]">
          문서 ({documents.length}건)
        </h3>
        <button
          onClick={() => {
            setShowUpload(!showUpload)
            setError("")
          }}
          className="inline-flex items-center rounded-xl bg-[#1976D2] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1565C0] transition-colors"
        >
          + 업로드
        </button>
      </div>

      {/* Upload form */}
      {showUpload && (
        <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white p-4">
          {error && (
            <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="block text-sm font-semibold text-[#333] mb-1.5">파일</label>
              <input
                ref={fileInputRef}
                type="file"
                className="mt-1 block w-full text-base text-gray-600 file:mr-3 file:rounded-xl file:border-0 file:bg-[#E3F2FD] file:px-3 file:py-1.5 file:text-base file:font-medium file:text-[#1976D2] hover:file:bg-[#BBDEFB]"
              />
            </div>
            <div className="w-full sm:w-40">
              <label className="block text-sm font-semibold text-[#333] mb-1.5">유형</label>
              <select
                value={selectedFileType}
                onChange={(e) => setSelectedFileType(e.target.value)}
                className="w-full appearance-none cursor-pointer rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 pr-8 text-sm font-medium text-gray-700 focus:outline-none focus:border-[#1976D2] bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%239CA3AF%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_0.75rem_center] bg-[length:1rem]"
              >
                {FILE_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="rounded-xl bg-[#1976D2] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1565C0] disabled:opacity-50 transition-colors"
              >
                {uploading ? "업로드 중..." : "업로드"}
              </button>
              <button
                onClick={() => setShowUpload(false)}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document list */}
      {documents.length === 0 ? (
        <div className="rounded-2xl bg-white px-5 py-12 text-center text-sm text-gray-400 shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100">
          등록된 문서가 없습니다
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-gray-500">파일명</th>
                <th className="px-4 py-3 text-center text-sm font-medium uppercase tracking-wider text-gray-500">유형</th>
                <th className="hidden px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-gray-500 sm:table-cell">업로드일</th>
                <th className="px-4 py-3 text-right text-sm font-medium uppercase tracking-wider text-gray-500">작업</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => {
                const typeCfg = FILE_TYPE_CONFIG[doc.fileType] || FILE_TYPE_CONFIG.resume
                return (
                  <tr key={doc.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-[#333]">
                      <span className="max-w-[200px] truncate" title={doc.fileName}>
                        {doc.fileName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ${typeCfg.className}`}
                      >
                        {typeCfg.label}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-sm text-gray-600 sm:table-cell">
                      {formatDate(doc.uploadedAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border border-gray-200 px-2.5 py-1 text-sm font-medium text-[#1976D2] hover:bg-gray-50 transition-colors"
                        >
                          다운로드
                        </a>
                        <button
                          onClick={() => setDeleteId(doc.id)}
                          className="rounded-lg border border-gray-200 px-2.5 py-1 text-sm font-medium text-red-600 hover:bg-gray-50 transition-colors"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirm dialog */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h4 className="text-sm font-semibold text-[#333]">문서 삭제</h4>
            <p className="mt-2 text-sm text-gray-600">
              이 문서를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setDeleteId(null)}
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
