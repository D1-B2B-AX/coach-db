"use client"

import { useState, useEffect } from "react"

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
  const [email, setEmail] = useState(profile.email ?? "")
  const [affiliation, setAffiliation] = useState(profile.affiliation ?? "")
  const [availDetail, setAvailDetail] = useState(profile.availabilityDetail ?? "")
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set(profile.fields.map(f => f.name)))
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set(profile.curriculums.map(c => c.name)))
  const [saving, setSaving] = useState(false)
  const [extraRequest, setExtraRequest] = useState("")
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
          extraRequest: extraRequest.trim() || null,
          fields: [...selectedFields],
          curriculums: [...selectedSkills],
        }),
      })
      if (res.ok) {
        setSaved(true)
        setExtraRequest("")
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
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              placeholder="기타 분야 직접 입력"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:border-[#1976D2]"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  const val = (e.target as HTMLInputElement).value.trim()
                  if (val) { setSelectedFields(prev => new Set([...prev, val])); (e.target as HTMLInputElement).value = "" }
                }
              }}
            />
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
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              placeholder="기타 스킬 직접 입력"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:border-[#1976D2]"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  const val = (e.target as HTMLInputElement).value.trim()
                  if (val) { setSelectedSkills(prev => new Set([...prev, val])); (e.target as HTMLInputElement).value = "" }
                }
              }}
            />
          </div>
        </div>

        {/* 기타 요청 사항 */}
        <div>
          <label className="text-xs text-gray-400">기타 요청 사항</label>
          <textarea
            value={extraRequest}
            onChange={(e) => setExtraRequest(e.target.value)}
            placeholder="FC 기업교육팀에 요청하실 내용"
            rows={2}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1976D2]"
          />
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
