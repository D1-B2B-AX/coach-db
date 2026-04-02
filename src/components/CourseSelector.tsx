"use client"

import { useState } from "react"

export interface CourseOption {
  id: string
  name: string
  startDate: string | null
  endDate: string | null
}

interface CourseSelectorProps {
  courses: CourseOption[]
  selectedCourseId: string | null
  onCourseChange: (courseId: string | null) => void
  onCourseCreate: (course: CourseOption) => void
  defaultStartDate?: string | null
  defaultEndDate?: string | null
}

export default function CourseSelector({
  courses,
  selectedCourseId,
  onCourseChange,
  onCourseCreate,
  defaultStartDate,
  defaultEndDate,
}: CourseSelectorProps) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState("")
  const [startDate, setStartDate] = useState(defaultStartDate || "")
  const [endDate, setEndDate] = useState(defaultEndDate || "")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  const hasCourses = courses.length > 0

  async function handleSubmit() {
    setError("")
    if (!name.trim()) {
      setError("과정명을 입력해주세요")
      return
    }
    if (endDate && !startDate) {
      setError("시작일 없이 종료일만 입력할 수 없습니다")
      return
    }
    if (startDate && endDate && endDate < startDate) {
      setError("종료일은 시작일 이후여야 합니다")
      return
    }

    setSaving(true)
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
      })
      if (res.ok) {
        const course = await res.json()
        onCourseCreate({
          id: course.id,
          name: course.name,
          startDate: course.startDate,
          endDate: course.endDate,
        })
        onCourseChange(course.id)
        setShowForm(false)
        setName("")
        setStartDate("")
        setEndDate("")
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || "과정 생성에 실패했습니다")
      }
    } catch {
      setError("과정 생성에 실패했습니다")
    } finally {
      setSaving(false)
    }
  }

  if (showForm) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="mb-2 text-sm font-medium text-gray-700">새 과정 추가</div>
        {error && (
          <div className="mb-2 text-xs text-red-600">{error}</div>
        )}
        <input
          type="text"
          placeholder="과정명을 입력하세요"
          maxLength={200}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          className={`mb-2 w-full rounded border px-2.5 py-1.5 text-sm ${
            error && !name.trim() ? "border-red-400" : "border-gray-300"
          } focus:border-blue-400 focus:outline-none`}
        />
        <div className="mb-2 flex gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
            placeholder="시작일"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={`w-full rounded border px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none ${
              error && endDate && (!startDate || endDate < startDate) ? "border-red-400" : "border-gray-300"
            }`}
            placeholder="종료일"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => { setShowForm(false); setError("") }}
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "추가 중..." : "추가"}
          </button>
        </div>
      </div>
    )
  }

  if (!hasCourses) {
    return (
      <button
        onClick={() => { setStartDate(defaultStartDate || ""); setEndDate(defaultEndDate || ""); setShowForm(true) }}
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600"
      >
        <span className="text-lg leading-none">+</span>
        새 과정 추가
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={selectedCourseId || ""}
        onChange={(e) => onCourseChange(e.target.value || null)}
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
      >
        <option value="">과정 선택 (선택)</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        onClick={() => { setStartDate(defaultStartDate || ""); setEndDate(defaultEndDate || ""); setShowForm(true) }}
        className="flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-2.5 py-2 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600"
        title="새 과정 추가"
      >
        <span className="text-base leading-none">+</span>
        <span className="hidden sm:inline">새 과정</span>
      </button>
    </div>
  )
}
