"use client"

import { useState, useEffect, useRef } from "react"

// --- Types ---

interface MasterItem {
  id: string
  name: string
}

export interface CoachDetail {
  id: string
  name: string
  birthDate: string | null
  phone: string | null
  email: string | null
  affiliation: string | null
  workType: string | null
  hourlyRate: number | null
  status: string
  selfNote: string | null
  managerNote: string | null
  accessToken: string
  fields: MasterItem[]
  curriculums: MasterItem[]
}

export interface CoachFormData {
  name: string
  birthDate: string | null
  phone: string | null
  email: string | null
  affiliation: string | null
  workType: string | null
  hourlyRate: number | null
  status: string
  selfNote: string | null
  managerNote: string | null
  fields: string[]
  curriculums: string[]
}

interface CoachFormProps {
  initialData?: CoachDetail
  onSubmit: (data: CoachFormData) => Promise<void>
  isEdit?: boolean
  formId?: string
}

// --- Constants ---

const STATUS_OPTIONS = [
  { value: "active", label: "활성" },
  { value: "inactive", label: "비활성" },
  { value: "on_leave", label: "휴직" },
]

// --- MultiSelectCombobox ---

interface MultiSelectComboboxProps {
  label: string
  selected: string[]
  onChange: (selected: string[]) => void
  options: MasterItem[]
  placeholder?: string
  chipColor?: "blue" | "purple"
}

function MultiSelectCombobox({
  label,
  selected,
  onChange,
  options,
  placeholder = "검색 또는 입력...",
}: MultiSelectComboboxProps) {
  const [inputValue, setInputValue] = useState("")
  const [showDropdown, setShowDropdown] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const filteredOptions = options.filter(
    (opt) =>
      !selected.includes(opt.name) &&
      opt.name.toLowerCase().includes(inputValue.toLowerCase())
  )

  // Check if input exactly matches an existing option (case-insensitive)
  const exactMatch = options.some(
    (opt) => opt.name.toLowerCase() === inputValue.trim().toLowerCase()
  )
  const showAddNew =
    inputValue.trim().length > 0 &&
    !exactMatch &&
    !selected.some((s) => s.toLowerCase() === inputValue.trim().toLowerCase())

  function addItem(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    if (!selected.includes(trimmed)) {
      onChange([...selected, trimmed])
    }
    setInputValue("")
    setShowDropdown(false)
  }

  function removeItem(name: string) {
    onChange(selected.filter((s) => s !== name))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      const trimmed = inputValue.trim()
      if (trimmed) {
        // If there's a filtered option matching, use that; otherwise add new
        const match = filteredOptions.find(
          (opt) => opt.name.toLowerCase() === trimmed.toLowerCase()
        )
        addItem(match ? match.name : trimmed)
      }
    }
    if (e.key === "Backspace" && inputValue === "" && selected.length > 0) {
      removeItem(selected[selected.length - 1])
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <label className="mb-1.5 block text-sm font-semibold text-[#333]">{label}</label>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 rounded-full bg-[#E3F2FD] px-3 py-1 text-sm font-medium text-[#1976D2]"
            >
              {name}
              <button
                type="button"
                onClick={() => removeItem(name)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-[#BBDEFB] transition-colors"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      <input
        type="text"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value)
          setShowDropdown(true)
        }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:border-[#1976D2]"
      />

      {/* Dropdown */}
      {showDropdown && (filteredOptions.length > 0 || showAddNew) && (
        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          {filteredOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => addItem(opt.name)}
              className="block w-full px-3 py-1.5 text-left text-base text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {opt.name}
            </button>
          ))}
          {showAddNew && (
            <button
              type="button"
              onClick={() => addItem(inputValue.trim())}
              className="block w-full px-3 py-1.5 text-left text-base text-[#1976D2] hover:bg-[#E3F2FD]/50 transition-colors"
            >
              &quot;{inputValue.trim()}&quot; 추가
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// --- CoachForm ---

export default function CoachForm({ initialData, onSubmit, isEdit = false, formId }: CoachFormProps) {
  // Form state
  const [name, setName] = useState(initialData?.name ?? "")
  const [birthDate, setBirthDate] = useState(
    initialData?.birthDate ? initialData.birthDate.slice(0, 10) : ""
  )
  const [phone, setPhone] = useState(initialData?.phone ?? "")
  const [email, setEmail] = useState(initialData?.email ?? "")
  const [affiliation, setAffiliation] = useState(initialData?.affiliation ?? "")
  const [workType, setWorkType] = useState(initialData?.workType ?? "")
  const [hourlyRate, setHourlyRate] = useState(
    initialData?.hourlyRate != null ? String(initialData.hourlyRate) : ""
  )
  const [status, setStatus] = useState(initialData?.status ?? "active")
  const [selfNote, setSelfNote] = useState(initialData?.selfNote ?? "")
  const [managerNote, setManagerNote] = useState(initialData?.managerNote ?? "")
  const [selectedFields, setSelectedFields] = useState<string[]>(
    initialData?.fields.map((f) => f.name) ?? []
  )
  const [selectedCurriculums, setSelectedCurriculums] = useState<string[]>(
    initialData?.curriculums.map((c) => c.name) ?? []
  )

  // Master data
  const [masterFields, setMasterFields] = useState<MasterItem[]>([])
  const [masterCurriculums, setMasterCurriculums] = useState<MasterItem[]>([])

  // UI state
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [nameError, setNameError] = useState("")

  // Fetch master data on mount
  useEffect(() => {
    async function fetchMasterData() {
      try {
        const [fieldsRes, curriculumsRes] = await Promise.all([
          fetch("/api/master/fields"),
          fetch("/api/master/curriculums"),
        ])
        if (fieldsRes.ok) {
          const data = await fieldsRes.json()
          setMasterFields(data.fields || [])
        }
        if (curriculumsRes.ok) {
          const data = await curriculumsRes.json()
          setMasterCurriculums(data.curriculums || [])
        }
      } catch {
        // silently fail -- options just won't be populated
      }
    }
    fetchMasterData()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setNameError("")

    // Validate
    if (!name.trim()) {
      setNameError("이름은 필수입니다.")
      return
    }

    const formData: CoachFormData = {
      name: name.trim(),
      birthDate: birthDate || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      affiliation: affiliation.trim() || null,
      workType: workType || null,
      hourlyRate: hourlyRate ? Number(hourlyRate) : null,
      status,
      selfNote: selfNote.trim() || null,
      managerNote: managerNote.trim() || null,
      fields: selectedFields,
      curriculums: selectedCurriculums,
    }

    setSubmitting(true)
    try {
      await onSubmit(formData)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "저장에 실패했습니다."
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-700">
          {error}
        </div>
      )}

      {/* Basic info section */}
      <div className="rounded-2xl bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100">
        <h3 className="mb-4 text-sm font-semibold text-[#333]">기본 정보</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* 이름 */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#333]">
              이름 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (nameError) setNameError("")
              }}
              placeholder="코치 이름"
              className={`w-full px-3.5 py-2.5 border rounded-xl text-base focus:outline-none ${
                nameError
                  ? "border-red-300 focus:border-red-500"
                  : "border-gray-200 focus:border-[#1976D2]"
              }`}
            />
            {nameError && (
              <p className="mt-1 text-sm text-red-600">{nameError}</p>
            )}
          </div>

          {/* 생년월일 */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#333]">생년월일</label>
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:border-[#1976D2]"
            />
          </div>

          {/* 전화번호 */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#333]">전화번호</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-0000-0000"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:border-[#1976D2]"
            />
          </div>

          {/* 이메일 */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#333]">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="coach@example.com"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:border-[#1976D2]"
            />
          </div>

          {/* 소속 */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#333]">소속</label>
            <input
              type="text"
              value={affiliation}
              onChange={(e) => setAffiliation(e.target.value)}
              placeholder="소속"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:border-[#1976D2]"
            />
          </div>

          {/* 근무유형 */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#333]">근무유형</label>
            <input
              type="text"
              value={workType}
              onChange={(e) => setWorkType(e.target.value)}
              placeholder="실습코치, 운영조교 등"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:border-[#1976D2]"
            />
          </div>

          {/* 시급 */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#333]">시급 (원)</label>
            <input
              type="number"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
              placeholder="0"
              min={0}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:border-[#1976D2]"
            />
          </div>

          {/* 상태 -- only in edit mode */}
          {isEdit && (
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-[#333]">상태</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full appearance-none cursor-pointer rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 pr-8 text-sm font-medium text-gray-700 focus:outline-none focus:border-[#1976D2] bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%239CA3AF%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_0.75rem_center] bg-[length:1rem]"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Fields & Curriculums section */}
      <div className="rounded-2xl bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100">
        <h3 className="mb-4 text-sm font-semibold text-[#333]">가능 분야 & 커리큘럼</h3>
        <div className="space-y-4">
          <MultiSelectCombobox
            label="가능 분야"
            selected={selectedFields}
            onChange={setSelectedFields}
            options={masterFields}
            placeholder="분야 검색 또는 입력..."
            chipColor="blue"
          />
          <MultiSelectCombobox
            label="가능 커리큘럼"
            selected={selectedCurriculums}
            onChange={setSelectedCurriculums}
            options={masterCurriculums}
            placeholder="커리큘럼 검색 또는 입력..."
            chipColor="purple"
          />
        </div>
      </div>

      {/* Notes section */}
      <div className="rounded-2xl bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100">
        <h3 className="mb-4 text-sm font-semibold text-[#333]">메모</h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#333]">특이사항 / 히스토리</label>
            <textarea
              value={selfNote}
              onChange={(e) => setSelfNote(e.target.value)}
              rows={3}
              placeholder="특이사항 / 히스토리"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:border-[#1976D2]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#333]">메모</label>
            <textarea
              value={managerNote}
              onChange={(e) => setManagerNote(e.target.value)}
              rows={3}
              placeholder="메모"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:border-[#1976D2]"
            />
          </div>
        </div>
      </div>

      {/* Floating submit — only when no external formId */}
      {!formId && (
        <>
          <div className="h-16" />
          <div className="fixed bottom-5 right-5 z-10">
            <button
              type="submit"
              disabled={submitting}
              className="cursor-pointer rounded-lg bg-[#1976D2] px-6 py-3 text-sm font-semibold text-white shadow-lg hover:bg-[#1565C0] disabled:opacity-50 transition-all"
            >
              {submitting ? "저장 중..." : "등록"}
            </button>
          </div>
        </>
      )}
    </form>
  )
}
