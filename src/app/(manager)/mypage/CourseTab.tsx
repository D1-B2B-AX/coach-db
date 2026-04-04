"use client"

import React, { useState, useRef } from "react"
import { Course, Scouting, STATUS_CONFIG, formatPeriod, getStatusCounts } from "./utils"
import EditCourseModal from "./EditCourseModal"

interface CourseTabProps {
  courses: Course[]
  scoutings: Scouting[]
  onCourseCreate: (name: string, startDate?: string, endDate?: string) => Promise<void>
  onCourseUpdate: (id: string, data: Partial<Course>) => Promise<void>
  onCourseDelete: (id: string) => Promise<void>
}

export default function CourseTab({ courses, scoutings, onCourseCreate, onCourseUpdate, onCourseDelete }: CourseTabProps) {
  const [newName, setNewName] = useState("")
  const [newStart, setNewStart] = useState("")
  const [newEnd, setNewEnd] = useState("")
  const [creating, setCreating] = useState(false)
  const [editCourse, setEditCourse] = useState<Course | null>(null)
  const [saving, setSaving] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const dateInvalid = newStart && newEnd && newStart > newEnd

  async function handleCreate() {
    if (!newName.trim() || dateInvalid) return
    setCreating(true)
    try {
      await onCourseCreate(newName.trim(), newStart || undefined, newEnd || undefined)
      setNewName("")
      setNewStart("")
      setNewEnd("")
      nameInputRef.current?.focus()
    } finally {
      setCreating(false)
    }
  }

  async function handleSave(data: Partial<Course>) {
    if (!editCourse) return
    setSaving(true)
    try {
      await onCourseUpdate(editCourse.id, data)
      setEditCourse(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!editCourse) return
    if (!confirm("이 과정을 삭제하시겠습니까? 연결된 찜꽁은 '과정 미지정'으로 이동합니다.")) return
    setSaving(true)
    try {
      await onCourseDelete(editCourse.id)
      setEditCourse(null)
    } finally {
      setSaving(false)
    }
  }

  // Sort courses newest first
  const sorted = [...courses].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return (
    <div className="space-y-3">
      {/* Inline fast creation row */}
      <div className="flex items-center gap-2 flex-wrap rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100 px-4 py-3">
        <input
          ref={nameInputRef}
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleCreate() }}
          placeholder="과정명"
          maxLength={200}
          disabled={creating}
          className="flex-1 min-w-[120px] rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-[#333] placeholder:text-gray-300 focus:border-[#1976D2] focus:outline-none"
        />
        <input
          type="date"
          value={newStart}
          onChange={(e) => setNewStart(e.target.value)}
          disabled={creating}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-[#333] focus:border-[#1976D2] focus:outline-none"
        />
        <input
          type="date"
          value={newEnd}
          onChange={(e) => setNewEnd(e.target.value)}
          disabled={creating}
          className={`rounded-lg border px-2 py-1.5 text-xs text-[#333] focus:outline-none ${
            dateInvalid ? "border-red-400 focus:border-red-500" : "border-gray-200 focus:border-[#1976D2]"
          }`}
        />
        <button
          onClick={handleCreate}
          disabled={!newName.trim() || !!dateInvalid || creating}
          className="cursor-pointer rounded-lg bg-[#1976D2] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#1565C0] disabled:opacity-40 transition-colors"
        >
          {creating ? "추가 중..." : "추가"}
        </button>
      </div>

      {/* Course card list */}
      {sorted.length === 0 ? (
        <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100 px-5 py-12 text-center text-sm text-gray-400">
          과정이 없습니다
        </div>
      ) : (
        sorted.map(course => {
          const courseScoutings = scoutings.filter(s => s.courseId === course.id)
          const statusCounts = getStatusCounts(courseScoutings)
          return (
            <div key={course.id} className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100 px-5 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-[#333] truncate">{course.name}</span>
                  <span className="text-[11px] text-gray-400 shrink-0">{formatPeriod(course.startDate, course.endDate)}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {(["scouting", "accepted", "confirmed", "rejected"] as const).map(st => {
                    const count = statusCounts[st] || 0
                    if (count === 0) return null
                    const cfg = STATUS_CONFIG[st]
                    return (
                      <span key={st} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.className}`}>
                        {cfg.label}({count})
                      </span>
                    )
                  })}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setEditCourse(course)}
                  className="cursor-pointer rounded-lg px-2.5 py-1 text-[11px] text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                >
                  수정
                </button>
                <button
                  onClick={async () => {
                    if (!confirm("이 과정을 삭제하시겠습니까? 연결된 찜꽁은 '과정 미지정'으로 이동합니다.")) return
                    await onCourseDelete(course.id)
                  }}
                  className="cursor-pointer rounded-lg px-2.5 py-1 text-[11px] text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                  삭제
                </button>
              </div>
            </div>
          )
        })
      )}

      {/* Edit modal */}
      {editCourse && (
        <EditCourseModal
          course={editCourse}
          saving={saving}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditCourse(null)}
        />
      )}
    </div>
  )
}
