"use client"

import { useEffect, useMemo, useState } from "react"
import RemovableChip from "@/components/ui/RemovableChip"

interface MasterItem { id: string; name: string }

interface CoachProfile {
  phone: string | null
  email: string | null
  affiliation: string | null
  availabilityDetail: string | null
  fields: MasterItem[]
  curriculums: MasterItem[]
}

interface Props {
  token: string
  profile: CoachProfile
  onSaved: () => void
  onClose?: () => void
  onDeactivated?: () => void
}

// 구글폼 7-1. 교육 분야 → DB: CoachField (가능 분야)
const FIELD_OPTIONS = [
  "개발 / 프로그래밍", "데이터 사이언스", "인공지능", "자동화 & 업무생산성", "디자인",
]

// 구글폼 7-2. 가능 분야 → DB: CoachCurriculum (가능 커리큘럼)
const CURRICULUM_AREA_OPTIONS = [
  "프론트엔드", "백엔드", "모바일 앱 개발", "데이터분석", "데이터엔지니어링",
  "머신러닝", "딥러닝", "클라우드 & 데브옵스", "업무자동화", "OA활용",
  "ChatGPT & 생성형AI", "UI/UX",
]

// 구글폼 7-3. 보유 스킬 → DB: CoachCurriculum (가능 커리큘럼)
const CURRICULUM_SKILL_OPTIONS = [
  "Python 기초", "Python 심화", "Java", "R", "C++", "Kotlin", "Swift",
  "HTML/CSS/JavaScript", "React/Vue.js/Next.js", "Node.js",
  "Django/Flask", "Spring/Springboot", "Hadoop/Spark",
  "Git/GitHub", "Orange3", "SQL", "확률통계",
  "Tableau/PowerBI", "OA (PPT/Excel)",
  "Docker/Kubernetes", "AWS/Azure/GCP", "Figma", "Photoshop",
]

export default function CoachProfileEdit({ token, profile, onSaved, onClose, onDeactivated }: Props) {
  const [phone, setPhone] = useState(profile.phone ?? "")
  const [email, setEmail] = useState(profile.email ?? "")
  const [affiliation, setAffiliation] = useState(profile.affiliation ?? "")
  const [availDetail, setAvailDetail] = useState(profile.availabilityDetail ?? "")
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set(profile.fields.map(f => f.name)))
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set(profile.curriculums.map(c => c.name)))
  const [customFieldInput, setCustomFieldInput] = useState("")
  const [customSkillInput, setCustomSkillInput] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Reset on profile change
  useEffect(() => {
    setPhone(profile.phone ?? "")
    setEmail(profile.email ?? "")
    setAffiliation(profile.affiliation ?? "")
    setAvailDetail(profile.availabilityDetail ?? "")
    setSelectedFields(new Set(profile.fields.map(f => f.name)))
    setSelectedSkills(new Set(profile.curriculums.map(c => c.name)))
  }, [profile])

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch(`/api/coach/me?token=${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim() || null,
          email: email.trim() || null,
          affiliation: affiliation.trim() || null,
          availabilityDetail: availDetail.trim() || null,
          fields: [...selectedFields],
          curriculums: [...selectedSkills],
        }),
      })
      if (res.ok) {
        setSaved(true)
        onSaved()
        setTimeout(() => { setSaved(false); onClose?.() }, 1000)
      }
    } finally {
      setSaving(false)
    }
  }

  function toggleItem(set: Set<string>, item: string, setter: (s: Set<string>) => void) {
    const next = new Set(set)
    if (next.has(item)) next.delete(item)
    else next.add(item)
    setter(next)
  }

  function appendCustomSkill(value: string, clear: () => void) {
    const normalized = value.trim()
    if (!normalized) return
    setSelectedSkills((prev) => new Set([...prev, normalized]))
    clear()
  }

  const hasChanges = useMemo(() => {
    const currentFields = [...selectedFields].sort().join(",")
    const currentSkills = [...selectedSkills].sort().join(",")
    return (
      (phone.trim() || null) !== (profile.phone ?? null) ||
      (email.trim() || null) !== (profile.email ?? null) ||
      (affiliation.trim() || null) !== (profile.affiliation ?? null) ||
      (availDetail.trim() || null) !== (profile.availabilityDetail ?? null) ||
      currentFields !== profile.fields.map(f => f.name).sort().join(",") ||
      currentSkills !== profile.curriculums.map(c => c.name).sort().join(",")
    )
  }, [affiliation, availDetail, email, phone, profile, selectedFields, selectedSkills])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 min-h-0 space-y-4 overflow-y-auto pr-1">
        {/* 연락처 + 이메일 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400">연락처</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-0000-0000"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1976D2]"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="coach@email.com"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1976D2]"
            />
          </div>
        </div>

        {/* 소속 */}
        <div>
          <label className="text-xs text-gray-400">소속</label>
          <input
            type="text"
            value={affiliation}
            onChange={(e) => setAffiliation(e.target.value)}
            placeholder="소속 (대학생일 경우 학과, 학년)"
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1976D2]"
          />
        </div>

        {/* 근무 가능 기간 */}
        <div>
          <label className="text-xs text-gray-400">근무 가능 기간</label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {["1~3개월", "4~6개월", "8~9개월", "9~12개월"].map(p => {
              const current = availDetail.split("\n")[0] || ""
              const isSelected = current === p
              return (
                <button
                  key={p}
                  onClick={() => {
                    const lines = availDetail.split("\n")
                    lines[0] = isSelected ? "" : p
                    setAvailDetail(lines.join("\n").trim())
                  }}
                  className={`cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    isSelected ? "bg-[#E3F2FD] text-[#1976D2]" : "bg-gray-50 text-gray-400"
                  }`}
                >
                  {p}
                </button>
              )
            })}
          </div>
          <textarea
            value={availDetail.split("\n").slice(1).join("\n")}
            onChange={(e) => {
              const period = availDetail.split("\n")[0] || ""
              const detail = e.target.value
              setAvailDetail([period, detail].filter(Boolean).join("\n"))
            }}
            placeholder="세부 사항 (주말 불가, 특정 요일 등)"
            rows={2}
            className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1976D2]"
          />
        </div>

        {/* 교육 분야 → CoachField */}
        <div>
          <label className="text-xs text-gray-400">교육 분야</label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {FIELD_OPTIONS.map(f => (
              selectedFields.has(f) ? (
                <RemovableChip
                  key={f}
                  tone="blue"
                  size="xs"
                  onRemove={() => toggleItem(selectedFields, f, setSelectedFields)}
                >
                  {f}
                </RemovableChip>
              ) : (
                <button
                  key={f}
                  onClick={() => toggleItem(selectedFields, f, setSelectedFields)}
                  className="cursor-pointer rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-100"
                >
                  {f}
                </button>
              )
            ))}
          </div>
        </div>

        {/* 가능 분야 → CoachCurriculum */}
        <div>
          <label className="text-xs text-gray-400">가능 분야</label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {CURRICULUM_AREA_OPTIONS.map(c => (
              selectedSkills.has(c) ? (
                <RemovableChip
                  key={c}
                  tone="purple"
                  size="xs"
                  onRemove={() => toggleItem(selectedSkills, c, setSelectedSkills)}
                >
                  {c}
                </RemovableChip>
              ) : (
                <button
                  key={c}
                  onClick={() => toggleItem(selectedSkills, c, setSelectedSkills)}
                  className="cursor-pointer rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-100"
                >
                  {c}
                </button>
              )
            ))}
          </div>
          <div className="relative mt-2">
            <input
              type="text"
              value={customFieldInput}
              onChange={(e) => setCustomFieldInput(e.target.value)}
              placeholder="기타 직접 입력"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-16 text-xs focus:border-[#1976D2] focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  appendCustomSkill(customFieldInput, () => setCustomFieldInput(""))
                }
              }}
            />
            <button
              type="button"
              onClick={() => appendCustomSkill(customFieldInput, () => setCustomFieldInput(""))}
              disabled={!customFieldInput.trim()}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md bg-[#1976D2] px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-[#1565C0] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
            >
              + 추가
            </button>
          </div>
        </div>

        {/* 보유 스킬 → CoachCurriculum */}
        <div>
          <label className="text-xs text-gray-400">보유 스킬</label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {CURRICULUM_SKILL_OPTIONS.map(s => (
              selectedSkills.has(s) ? (
                <RemovableChip
                  key={s}
                  tone="purple"
                  size="xs"
                  onRemove={() => toggleItem(selectedSkills, s, setSelectedSkills)}
                >
                  {s}
                </RemovableChip>
              ) : (
                <button
                  key={s}
                  onClick={() => toggleItem(selectedSkills, s, setSelectedSkills)}
                  className="cursor-pointer rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-100"
                >
                  {s}
                </button>
              )
            ))}
          </div>
          <div className="relative mt-2">
            <input
              type="text"
              value={customSkillInput}
              onChange={(e) => setCustomSkillInput(e.target.value)}
              placeholder="기타 직접 입력"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-16 text-xs focus:border-[#1976D2] focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  appendCustomSkill(customSkillInput, () => setCustomSkillInput(""))
                }
              }}
            />
            <button
              type="button"
              onClick={() => appendCustomSkill(customSkillInput, () => setCustomSkillInput(""))}
              disabled={!customSkillInput.trim()}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md bg-[#1976D2] px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-[#1565C0] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
            >
              + 추가
            </button>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-gray-100 bg-white pt-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onClose?.()}
            className="flex-1 cursor-pointer rounded-lg border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className={`flex-1 cursor-pointer rounded-lg py-2.5 text-sm font-semibold transition-all ${
              saving
                ? "cursor-not-allowed bg-gray-200 text-gray-400"
                : saved
                  ? "bg-[#2E7D32] text-white hover:bg-[#256427]"
                  : !hasChanges
                    ? "cursor-not-allowed bg-gray-200 text-gray-400"
                    : "bg-[#1976D2] text-white hover:bg-[#1565C0]"
            }`}
          >
            {saving ? "저장 중..." : saved ? "✓ 저장됨" : "저장"}
          </button>
        </div>
      </div>
    </div>
  )
}
