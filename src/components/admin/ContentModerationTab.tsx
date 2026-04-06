"use client"

import { useState, useEffect, useCallback } from "react"
import type { UnifiedContentItem, ContentType } from "@/types/content-moderation"

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  memo: "메모",
  review: "리뷰",
  audit: "수정이력",
}

const CONTENT_TYPE_COLORS: Record<ContentType, string> = {
  memo: "bg-[#E3F2FD] text-[#1976D2]",
  review: "bg-[#E8F5E9] text-[#2E7D32]",
  audit: "bg-[#FFF3E0] text-[#E65100]",
}

const FILTER_OPTIONS: { key: ContentType | "all"; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "memo", label: "메모" },
  { key: "review", label: "리뷰" },
  { key: "audit", label: "수정이력" },
]

export default function ContentModerationTab() {
  const [items, setItems] = useState<UnifiedContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [filter, setFilter] = useState<ContentType | "all">("all")

  // 수정 상태
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [editRating, setEditRating] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  // 삭제 확인 모달
  const [deleteTarget, setDeleteTarget] = useState<UnifiedContentItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  // 경고 모달
  const [warnTarget, setWarnTarget] = useState<UnifiedContentItem | null>(null)
  const [warnMessage, setWarnMessage] = useState("")
  const [warning, setWarning] = useState(false)

  const fetchItems = useCallback(async (cursor?: string | null, append = false) => {
    if (!append) setLoading(true)
    else setLoadingMore(true)

    try {
      const params = new URLSearchParams()
      if (cursor) params.set("cursor", cursor)
      if (filter !== "all") params.set("contentType", filter)
      params.set("limit", "20")

      const res = await fetch(`/api/admin/content-moderation?${params}`)
      if (!res.ok) return

      const data = await res.json()
      if (append) {
        setItems(prev => [...prev, ...data.items])
      } else {
        setItems(data.items)
      }
      setNextCursor(data.nextCursor)
    } catch {
      // ignore
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [filter])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  // 수정 저장
  async function handleSave(item: UnifiedContentItem) {
    setSaving(true)
    try {
      const body: Record<string, any> = { sourceTable: item.sourceTable }
      if (item.contentType === "review") {
        body.text = editText
        body.rating = editRating
      } else {
        body.text = editText
      }

      const res = await fetch(`/api/admin/content-moderation/${item.sourceRecordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        setItems(prev => prev.map(i => {
          if (i.id !== item.id) return i
          return {
            ...i,
            text: editText,
            ...(item.contentType === "review" ? { rating: editRating } : {}),
          }
        }))
        setEditingId(null)
      }
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  // 삭제
  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/content-moderation/${deleteTarget.sourceRecordId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceTable: deleteTarget.sourceTable }),
      })

      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== deleteTarget.id))
        setDeleteTarget(null)
      }
    } catch {
      // ignore
    } finally {
      setDeleting(false)
    }
  }

  // 경고
  async function handleWarn() {
    if (!warnTarget) return
    setWarning(true)
    try {
      const res = await fetch(`/api/admin/content-moderation/${warnTarget.sourceRecordId}/warn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorManagerId: warnTarget.authorManagerId,
          warningMessage: warnMessage,
          contentType: warnTarget.contentType,
          sourceRecordId: warnTarget.sourceRecordId,
          sourceTable: warnTarget.sourceTable,
          targetLabel: warnTarget.targetLabel,
        }),
      })

      if (res.ok) {
        setWarnTarget(null)
        setWarnMessage("")
      }
    } catch {
      // ignore
    } finally {
      setWarning(false)
    }
  }

  function startEdit(item: UnifiedContentItem) {
    setEditingId(item.id)
    setEditText(item.text || "")
    setEditRating(item.rating ?? null)
  }

  function formatDate(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }) +
      " " + d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
  }

  return (
    <div className="space-y-4">
      {/* Filter chips */}
      <div className="flex items-center gap-2">
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => { setFilter(opt.key); setNextCursor(null) }}
            className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              filter === opt.key
                ? "bg-[#333] text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Content list */}
      <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="px-5 py-12 text-center text-sm text-gray-400">불러오는 중...</div>
        ) : items.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-gray-400">콘텐츠가 없습니다</div>
        ) : (
          <>
            {items.map(item => (
              <div key={`${item.sourceTable}-${item.id}`} className="border-b border-gray-100 last:border-0 px-5 py-4">
                {/* Header */}
                <div className="flex items-center gap-2 mb-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CONTENT_TYPE_COLORS[item.contentType]}`}>
                    {CONTENT_TYPE_LABELS[item.contentType]}
                  </span>
                  <span className="text-xs font-medium text-[#333]">{item.authorName}</span>
                  <span className="text-[11px] text-gray-400">{item.targetLabel}</span>
                  <span className="ml-auto text-[11px] text-gray-400">{formatDate(item.sortTimestamp)}</span>
                </div>

                {/* Content */}
                {editingId === item.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#333] focus:border-[#1976D2] focus:outline-none"
                    />
                    {item.contentType === "review" && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">별점:</span>
                        {[1, 2, 3, 4, 5].map(n => (
                          <button
                            key={n}
                            onClick={() => setEditRating(n)}
                            className={`cursor-pointer text-sm ${editRating !== null && n <= editRating ? "text-yellow-500" : "text-gray-300"}`}
                          >
                            ★
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSave(item)}
                        disabled={saving}
                        className="cursor-pointer rounded-lg bg-[#1976D2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1565C0] disabled:opacity-50"
                      >
                        {saving ? "저장 중..." : "저장"}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {item.contentType === "audit" && item.previousText && (
                      <div className="mb-1 text-xs text-gray-400 line-through">{item.previousText}</div>
                    )}
                    <div className="text-sm text-[#333] whitespace-pre-wrap">{item.text || <span className="text-gray-400">(내용 없음)</span>}</div>
                    {item.contentType === "review" && item.rating != null && (
                      <div className="mt-1 text-sm text-yellow-500">
                        {"★".repeat(item.rating)}{"☆".repeat(5 - item.rating)}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="mt-2 flex gap-2">
                      {item.canEdit && (
                        <button
                          onClick={() => startEdit(item)}
                          className="cursor-pointer rounded-md bg-gray-50 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 transition-colors"
                        >
                          수정
                        </button>
                      )}
                      {item.canDelete && (
                        <button
                          onClick={() => setDeleteTarget(item)}
                          className="cursor-pointer rounded-md bg-gray-50 px-2.5 py-1 text-xs text-red-500 hover:bg-red-50 transition-colors"
                        >
                          삭제
                        </button>
                      )}
                      {item.canWarn ? (
                        <button
                          onClick={() => { setWarnTarget(item); setWarnMessage("") }}
                          className="cursor-pointer rounded-md bg-gray-50 px-2.5 py-1 text-xs text-[#E65100] hover:bg-[#FFF3E0] transition-colors"
                        >
                          경고
                        </button>
                      ) : item.contentType !== "audit" && !item.authorManagerId ? (
                        <span
                          title="작성자 불명"
                          className="rounded-md bg-gray-50 px-2.5 py-1 text-xs text-gray-300 cursor-not-allowed"
                        >
                          경고
                        </span>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            ))}

            {/* Load more */}
            {nextCursor && (
              <div className="px-5 py-4 text-center border-t border-gray-100">
                <button
                  onClick={() => fetchItems(nextCursor, true)}
                  disabled={loadingMore}
                  className="cursor-pointer rounded-lg bg-gray-50 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors"
                >
                  {loadingMore ? "불러오는 중..." : "더보기"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h4 className="text-sm font-semibold text-[#333]">콘텐츠 삭제</h4>
            <p className="mt-2 text-sm text-gray-600">
              이 콘텐츠를 삭제하시겠습니까? 원본은 수정 이력에 보존됩니다.
            </p>
            <div className="mt-1 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 max-h-20 overflow-auto">
              {deleteTarget.text}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="cursor-pointer rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="cursor-pointer rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Warn modal */}
      {warnTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h4 className="text-sm font-semibold text-[#333]">경고 알림 발송</h4>
            <p className="mt-2 text-sm text-gray-600">
              <span className="font-medium">{warnTarget.authorName}</span>님에게 경고 알림을 보냅니다.
            </p>
            <textarea
              value={warnMessage}
              onChange={e => setWarnMessage(e.target.value)}
              placeholder="경고 사유를 입력하세요..."
              rows={3}
              className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#333] placeholder:text-gray-400 focus:border-[#1976D2] focus:outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setWarnTarget(null)}
                className="cursor-pointer rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleWarn}
                disabled={warning || !warnMessage.trim()}
                className="cursor-pointer rounded-lg bg-[#E65100] px-4 py-2 text-sm font-semibold text-white hover:bg-[#D84315] disabled:opacity-50"
              >
                {warning ? "발송 중..." : "경고 발송"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
