import { prisma } from './prisma'

/**
 * 섭외 취소/리셋 시 연관 EngagementSchedule을 soft-cancel.
 * 3-tuple (engagementId, coachId, date) 기준으로 식별.
 * 활성 스케줄이 0건이면 Engagement.status도 'cancelled'로 변경.
 */
export async function cancelEngagementScheduleForScouting(
  scouting: { coachId: string; date: Date; courseName?: string | null },
  course: { startDate: Date | null; endDate: Date | null } | null,
): Promise<void> {
  const engCourseName = scouting.courseName || ''
  const courseStartDate = course?.startDate ?? scouting.date
  const courseEndDate = course?.endDate ?? scouting.date

  const engagement = await prisma.engagement.findFirst({
    where: {
      coachId: scouting.coachId,
      courseName: engCourseName,
      startDate: courseStartDate,
      endDate: courseEndDate,
    },
  })

  if (!engagement) return

  // 3-tuple로 EngagementSchedule soft-cancel
  await prisma.engagementSchedule.updateMany({
    where: {
      engagementId: engagement.id,
      coachId: scouting.coachId,
      date: scouting.date,
      cancelledAt: null,
    },
    data: { cancelledAt: new Date() },
  })

  // 활성 스케줄 수 확인 → 0건이면 Engagement도 cancelled
  const activeCount = await prisma.engagementSchedule.count({
    where: {
      engagementId: engagement.id,
      cancelledAt: null,
    },
  })

  if (activeCount === 0) {
    await prisma.engagement.update({
      where: { id: engagement.id },
      data: { status: 'cancelled' },
    })
  }
}
