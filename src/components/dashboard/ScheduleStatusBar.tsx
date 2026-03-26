"use client"

interface StatusData {
  yearMonth: string
  status: {
    notAccessed: number
    accessedOnly: number
    completed: number
  }
  notAccessedCoaches: { id: string; name: string }[]
}

interface ScheduleStatusBarProps {
  statusData: StatusData | null
  loading: boolean
}

export default function ScheduleStatusBar({
  statusData,
  loading,
}: ScheduleStatusBarProps) {
  const total = statusData
    ? statusData.status.notAccessed +
      statusData.status.accessedOnly +
      statusData.status.completed
    : 0

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white px-5 py-3 shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100">
      <span className="whitespace-nowrap text-sm font-semibold text-[#333]">스케줄 현황</span>
      {loading ? (
        <span className="text-xs text-gray-400">...</span>
      ) : statusData && (
        <>
          <span className="whitespace-nowrap text-xs text-gray-500">
            완료 <span className="font-medium text-[#2E7D32]">{statusData.status.completed}</span>
          </span>
          <span className="whitespace-nowrap text-xs text-gray-500">
            접속만 <span className="font-medium text-[#F57F17]">{statusData.status.accessedOnly}</span>
          </span>
          {statusData.status.notAccessed > 0 && (
            <span className="whitespace-nowrap text-xs font-medium text-[#D84315]">
              미입력 {statusData.status.notAccessed}
            </span>
          )}
          <span className="whitespace-nowrap text-xs text-gray-400">전체 {total}명</span>
        </>
      )}
    </div>
  )
}
