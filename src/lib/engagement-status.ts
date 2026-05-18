type EngagementStatus = "scheduled" | "in_progress" | "completed" | "cancelled"

export function effectiveEngagementStatus(
  status: string,
  startDate: string | Date,
  endDate: string | Date,
): EngagementStatus {
  if (status === "cancelled") return "cancelled"

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const end = new Date(endDate)
  end.setHours(0, 0, 0, 0)
  if (end < today) return "completed"

  const start = new Date(startDate)
  start.setHours(0, 0, 0, 0)
  if (start <= today) return "in_progress"

  return "scheduled"
}
