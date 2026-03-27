"use client"

interface CoachHeaderProps {
  coachName: string
  month: number // 1-based
  lastSavedAt: string | null
  onExit: () => void
  onProfile?: () => void
}

export default function CoachHeader({
  coachName,
  month,
  lastSavedAt,
  onExit,
  onProfile,
}: CoachHeaderProps) {
  const formatLastSaved = (iso: string | null) => {
    if (!iso) return null
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  }

  const savedText = formatLastSaved(lastSavedAt)

  return (
    <div className="bg-[#1565C0] px-7 pt-6 pb-4 text-white">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[18px] font-semibold leading-snug">
            {coachName} 코치님, {month}월 가능 일정
          </h2>
          <p className="mt-1 text-[13px] opacity-85">
            날짜를 클릭하면 시간대를 선택할 수 있습니다
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onProfile && (
            <button
              onClick={onProfile}
              className="cursor-pointer rounded-md bg-white/20 p-1.5 text-white backdrop-blur-sm hover:bg-white/30 transition-colors"
              title="프로필 수정"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            </button>
          )}
          <button
            onClick={onExit}
            className="cursor-pointer whitespace-nowrap rounded-md bg-white/20 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm hover:bg-white/30 transition-colors"
          >
            나가기
          </button>
        </div>
      </div>
      {savedText && (
        <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-white/15 px-3.5 py-2 text-[13px]">
          <span>&#9200;</span> 마지막 저장: {savedText}
        </div>
      )}
    </div>
  )
}
