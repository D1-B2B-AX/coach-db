"use client"

interface CoachHeaderProps {
  coachName: string
  onProfile?: () => void
}

const BUTTON_BASE = "inline-flex h-10 items-center justify-center rounded-md bg-white/20 text-white backdrop-blur-sm transition-colors"

export default function CoachHeader({
  coachName,
  onProfile,
}: CoachHeaderProps) {
  return (
    <div className="px-5 pt-5 pb-6 text-white">
      <div className="flex items-center">
        <img
          src="/fastcampus-logo.svg"
          alt="Fast Campus"
          className="h-5 w-auto"
        />
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <h2 className="text-[18px] font-semibold leading-snug">
            안녕하세요, {coachName}님
          </h2>
          <p className="mt-1 text-[13px] opacity-85">
            날짜를 선택하여 일정을 입력해주세요
          </p>
        </div>
        {onProfile && (
          <button
            onClick={onProfile}
            className={`${BUTTON_BASE} w-9 h-9 px-0 hover:bg-white/30 shrink-0 ml-3`}
            title="프로필 수정"
            type="button"
          >
            <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          </button>
        )}
      </div>
    </div>
  )
}
