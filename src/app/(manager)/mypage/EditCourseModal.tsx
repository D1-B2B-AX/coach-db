"use client"

import React, { useState } from "react"
import type { Course } from "./utils"

interface EditCourseModalProps {
  course: Course
  saving: boolean
  onSave: (data: Partial<Course>) => void
  onDelete: () => void
  onClose: () => void
}

export default function EditCourseModal({ course, saving, onSave, onDelete, onClose }: EditCourseModalProps) {
  const [name, setName] = useState(course.name)
  const [desc, setDesc] = useState(course.description || "")
  const [startDate, setStartDate] = useState(course.startDate?.slice(0, 10) || "")
  const [endDate, setEndDate] = useState(course.endDate?.slice(0, 10) || "")
  const [workHours, setWorkHours] = useState(course.workHours || "")
  const [location, setLocation] = useState(course.location || "")
  const [hourlyRate, setHourlyRate] = useState(
    course.hourlyRate !== null && course.hourlyRate !== undefined ? String(course.hourlyRate) : ""
  )

  function handleSave() {
    if (!name.trim()) return
    const parsedHourlyRate = hourlyRate.trim() ? Number(hourlyRate) : null
    if (parsedHourlyRate !== null && (!Number.isFinite(parsedHourlyRate) || parsedHourlyRate < 0)) {
      alert("시급은 0 이상의 숫자로 입력해주세요.")
      return
    }
    onSave({
      name: name.trim(),
      description: desc.trim() || null,
      startDate: startDate || null,
      endDate: endDate || null,
      workHours: workHours.trim() || null,
      location: location.trim() || null,
      hourlyRate: parsedHourlyRate,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={() => !saving && onClose()}
    >
      <div
        className="w-full max-w-[560px] rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-[#333]">과정 수정</h3>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">과정명</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              disabled={saving}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-[#333] focus:border-[#1976D2] focus:outline-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">시작일</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={saving}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-[#333] focus:border-[#1976D2] focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">종료일</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={saving}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-[#333] focus:border-[#1976D2] focus:outline-none"
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">근무시간</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="time"
                  value={workHours.split("~")[0]?.trim() || ""}
                  onChange={(e) => {
                    const end = workHours.split("~")[1]?.trim() || ""
                    setWorkHours(end ? `${e.target.value}~${end}` : e.target.value)
                  }}
                  disabled={saving}
                  className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm text-[#333] focus:border-[#1976D2] focus:outline-none"
                />
                <span className="text-xs text-gray-400 shrink-0">~</span>
                <input
                  type="time"
                  value={workHours.split("~")[1]?.trim() || ""}
                  onChange={(e) => {
                    const start = workHours.split("~")[0]?.trim() || ""
                    setWorkHours(start ? `${start}~${e.target.value}` : `~${e.target.value}`)
                  }}
                  disabled={saving}
                  className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm text-[#333] focus:border-[#1976D2] focus:outline-none"
                />
              </div>
              <div className="mt-1.5 flex gap-1.5">
                {[["09:00~18:00", "9-18"], ["08:30~17:30", "8:30-17:30"]].map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    disabled={saving}
                    onClick={() => setWorkHours(v)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                      workHours === v
                        ? "border-[#1976D2] bg-[#1976D2] text-white"
                        : "border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100"
                    } ${saving ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">장소</span>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="예: 강남 본사"
                disabled={saving}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-[#333] focus:border-[#1976D2] focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">시급</span>
              <input
                type="number"
                min="0"
                step="100"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="예: 15000"
                disabled={saving}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-[#333] focus:border-[#1976D2] focus:outline-none"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">과정 내용</span>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="코치에게 보여질 과정 설명을 입력하세요"
              rows={4}
              disabled={saving}
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-[#333] focus:border-[#1976D2] focus:outline-none"
            />
          </label>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={onDelete}
            disabled={saving}
            className="cursor-pointer rounded-lg px-3 py-2 text-sm text-red-500 hover:bg-red-50 disabled:opacity-50"
          >
            삭제
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="cursor-pointer rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="cursor-pointer rounded-lg bg-[#1976D2] px-3 py-2 text-sm font-medium text-white hover:bg-[#1565C0] disabled:opacity-50"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
