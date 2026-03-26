"use client"

interface CoachHeaderProps {
  coachName: string
  month: number // 1-based
  lastSavedAt: string | null
  onExit: () => void
}

export default function CoachHeader({
  coachName,
  month,
  lastSavedAt,
  onExit,
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
        <button
          onClick={onExit}
          className="cursor-pointer whitespace-nowrap rounded-md bg-white/20 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm hover:bg-white/30 transition-colors"
        >
          나가기
        </button>
      </div>
      {savedText && (
        <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-white/15 px-3.5 py-2 text-[13px]">
          <span>&#9200;</span> 마지막 저장: {savedText}
        </div>
      )}
    </div>
  )
}
