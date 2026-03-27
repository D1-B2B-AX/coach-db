"use client"

import { useState, useEffect } from "react"

interface MasterItem { id: string; name: string }

interface CoachProfile {
  phone: string | null
  workType: string | null
  availabilityDetail: string | null
  fields: MasterItem[]
  curriculums: MasterItem[]
}

interface Props {
  token: string
  profile: CoachProfile
  onSaved: () => void
}

const FIELD_OPTIONS = [
  "개발 / 프로그래밍", "데이터 사이언스", "인공지능", "자동화 & 업무생산성", "디자인",
  "프론트엔드", "백엔드", "모바일 앱 개발", "데이터분석", "데이터엔지니어링",
  "머신러닝", "딥러닝", "클라우드 & 데브옵스", "업무자동화", "OA활용",
  "ChatGPT & 생성형AI", "UI/UX",
]

const SKILL_OPTIONS = [
  "Python 기초", "Python 심화", "Java", "R", "C++", "Kotlin", "Swift",
  "HTML/CSS/JavaScript", "React/Vue.js/Next.js", "Node.js",
  "Django/Flask", "Spring/Springboot", "Hadoop/Spark",
  "Git/GitHub", "Orange3", "SQL", "확률통계",
  "Tableau/PowerBI", "OA (PPT/Excel)",
  "Docker/Kubernetes", "AWS/Azure/GCP", "Figma", "Photoshop",
]

export default function CoachProfileEdit({ token, profile, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState(profile.phone ?? "")
  const [workType, setWorkType] = useState(profile.workType ?? "")
  const [availDetail, setAvailDetail] = useState(profile.availabilityDetail ?? "")
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set(profile.fields.map(f => f.name)))
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set(profile.curriculums.map(c => c.name)))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Reset on profile change
  useEffect(() => {
    setPhone(profile.phone ?? "")
    setWorkType(profile.workType ?? "")
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
          workType: workType || null,
          availabilityDetail: availDetail.trim() || null,
          fields: [...selectedFields],
          curriculums: [...selectedSkills],
        }),
      })
      if (res.ok) {
        setSaved(true)
        onSaved()
        setTimeout(() => setSaved(false), 2000)
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

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 w-full cursor-pointer rounded-xl border border-gray-200 bg-white py-3 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
      >
        프로필 수정
      </button>
    )
  }

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white">
      <button
        onClick={() => setOpen(false)}
        className="flex w-full cursor-pointer items-center justify-between px-5 py-3 text-sm font-semibold text-[#333]"
      >
        프로필 수정
        <span className="text-gray-400">▲</span>
      </button>

      <div className="border-t border-gray-100 px-5 py-4 space-y-4">
        {/* 연락처 */}
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

        {/* 수행 업무 */}
        <div>
          <label className="text-xs text-gray-400">수행 업무</label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {["실습코치", "운영조교"].map(t => (
              <button
                key={t}
                onClick={() => {
                  const types = workType ? workType.split(",").map(s => s.trim()).filter(Boolean) : []
                  if (types.includes(t)) setWorkType(types.filter(x => x !== t).join(", "))
                  else setWorkType([...types, t].join(", "))
                }}
                className={`cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  workType?.includes(t) ? "bg-[#F3E5F5] text-[#7B1FA2]" : "bg-gray-100 text-gray-400"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* 근무 가능 기간 */}
        <div>
          <label className="text-xs text-gray-400">근무 가능 기간 / 세부</label>
          <textarea
            value={availDetail}
            onChange={(e) => setAvailDetail(e.target.value)}
            placeholder="예: 3~6월 가능 (주말 불가)"
            rows={2}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1976D2]"
          />
        </div>

        {/* 교육 분야 */}
        <div>
          <label className="text-xs text-gray-400">교육 분야</label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {FIELD_OPTIONS.map(f => (
              <button
                key={f}
                onClick={() => toggleItem(selectedFields, f, setSelectedFields)}
                className={`cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  selectedFields.has(f) ? "bg-[#E3F2FD] text-[#1976D2]" : "bg-gray-50 text-gray-400"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* 보유 스킬 */}
        <div>
          <label className="text-xs text-gray-400">보유 스킬</label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {SKILL_OPTIONS.map(s => (
              <button
                key={s}
                onClick={() => toggleItem(selectedSkills, s, setSelectedSkills)}
                className={`cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  selectedSkills.has(s) ? "bg-[#F3E5F5] text-[#7B1FA2]" : "bg-gray-50 text-gray-400"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* 저장 */}
        <button
          onClick={handleSave}
          disabled={saving}
          className={`w-full cursor-pointer rounded-lg py-2.5 text-sm font-semibold transition-all disabled:opacity-50 ${
            saved ? "bg-[#2E7D32] text-white" : "bg-[#1976D2] text-white hover:bg-[#1565C0]"
          }`}
        >
          {saving ? "저장 중..." : saved ? "✓ 저장됨" : "프로필 저장"}
        </button>
      </div>
    </div>
  )
}
