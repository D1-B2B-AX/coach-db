"use client"

interface SaveButtonProps {
  onSave: () => void
  saving: boolean
  saved: boolean
  savedDayCount: number
  savedTotalHours: number
}

export default function SaveButton({
  onSave,
  saving,
  saved,
}: SaveButtonProps) {
  return (
    <button
      onClick={onSave}
      disabled={saving}
      className={`cursor-pointer rounded-lg border-none px-6 py-3 text-sm font-semibold shadow-lg transition-all disabled:opacity-50 ${
        saved
          ? "bg-[#2E7D32] text-white"
          : "bg-[#1976D2] text-white hover:bg-[#1565C0]"
      }`}
    >
      {saving ? "저장 중..." : saved ? "✓ 저장됨" : "저장하기"}
    </button>
  )
}
