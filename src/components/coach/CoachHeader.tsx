"use client"

interface CoachHeaderProps {
  coachName: string
  onProfile?: () => void
}

export default function CoachHeader({
  coachName,
  onProfile,
}: CoachHeaderProps) {
  return (
    <div className="bg-[#1565C0] px-7 pt-6 pb-4 text-white">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[18px] font-semibold leading-snug">
            안녕하세요, {coachName}님
          </h2>
          <p className="mt-1 text-[13px] opacity-85">
            날짜를 선택하여 일정을 입력해주세요
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
        </div>
      </div>
    </div>
  )
}
