"use client"

import { useMemo, useState } from "react"

type ApplicationStatus = "applied" | "cancelled" | "confirmed"

interface CoachOption {
  id: string
  name: string
}

interface ActivityLog {
  id: string
  at: string
  message: string
}

interface ApplicationEntry {
  coachId: string
  status: ApplicationStatus
  appliedAt: string
  updatedAt: string
  confirmedAt: string | null
}

interface CourseEntry {
  id: string
  title: string
  startDate: string
  endDate: string
  time: string
  curriculum: string
  visibleFrom: string
  deadline: string
  sourceFileName?: string
  applications: ApplicationEntry[]
  logs: ActivityLog[]
}

interface SamsungDsPrototypeProps {
  coaches: CoachOption[]
}

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function addDays(base: Date, days: number) {
  const copy = new Date(base)
  copy.setDate(copy.getDate() + days)
  return copy
}

function toInputDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function toDateLabel(value: string) {
  return value.replaceAll("-", ".")
}

function toDateTimeLabel(value: string) {
  const date = new Date(value)
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

function overlaps(a: CourseEntry, b: CourseEntry) {
  return a.startDate <= b.endDate && b.startDate <= a.endDate
}

function createLog(message: string): ActivityLog {
  return {
    id: makeId("log"),
    at: new Date().toISOString(),
    message,
  }
}

function getStatusLabel(status: ApplicationStatus) {
  if (status === "applied") return "신청"
  if (status === "confirmed") return "확정"
  return "신청 취소"
}

function getStatusClasses(status: ApplicationStatus) {
  if (status === "applied") return "bg-[#E8F0FE] text-[#1A73E8]"
  if (status === "confirmed") return "bg-[#E8F5E9] text-[#2E7D32]"
  return "bg-[#F3E5F5] text-[#7B1FA2]"
}

function buildInitialCourses(coaches: CoachOption[]) {
  const now = new Date()
  const [firstCoach, secondCoach, thirdCoach] = coaches

  return [
    {
      id: makeId("course"),
      title: "삼전 DS 알고리즘 집중반",
      startDate: toInputDate(addDays(now, 18)),
      endDate: toInputDate(addDays(now, 20)),
      time: "09:00~18:00",
      curriculum: "자료구조 복습\n정렬/탐색 심화\n실전 코딩테스트 풀이",
      visibleFrom: toInputDate(addDays(now, -2)),
      deadline: toInputDate(addDays(now, 6)),
      sourceFileName: "algo-bootcamp.pptx",
      applications: [
        firstCoach
          ? {
              coachId: firstCoach.id,
              status: "applied" as const,
              appliedAt: addDays(now, -1).toISOString(),
              updatedAt: addDays(now, -1).toISOString(),
              confirmedAt: null,
            }
          : undefined,
        secondCoach
          ? {
              coachId: secondCoach.id,
              status: "confirmed" as const,
              appliedAt: addDays(now, -2).toISOString(),
              updatedAt: addDays(now, -1).toISOString(),
              confirmedAt: addDays(now, -1).toISOString(),
            }
          : undefined,
      ].filter(Boolean) as ApplicationEntry[],
      logs: [createLog("샘플 과정이 생성되었습니다.")],
    },
    {
      id: makeId("course"),
      title: "삼전 DS 백엔드 실무반",
      startDate: toInputDate(addDays(now, 9)),
      endDate: toInputDate(addDays(now, 11)),
      time: "09:00~18:00",
      curriculum: "Spring Boot 운영 패턴\n데이터 접근 계층 설계\n트러블슈팅 워크숍",
      visibleFrom: toInputDate(addDays(now, -5)),
      deadline: toInputDate(addDays(now, -1)),
      sourceFileName: "backend-practice.pptx",
      applications: [
        thirdCoach
          ? {
              coachId: thirdCoach.id,
              status: "cancelled" as const,
              appliedAt: addDays(now, -4).toISOString(),
              updatedAt: addDays(now, -2).toISOString(),
              confirmedAt: null,
            }
          : undefined,
      ].filter(Boolean) as ApplicationEntry[],
      logs: [createLog("마감된 샘플 과정입니다.")],
    },
    {
      id: makeId("course"),
      title: "삼전 DS 문제해결 스프린트",
      startDate: toInputDate(addDays(now, 34)),
      endDate: toInputDate(addDays(now, 36)),
      time: "09:00~18:00",
      curriculum: "문제 분해 훈련\n팀 단위 코드리뷰\n케이스 스터디",
      visibleFrom: toInputDate(addDays(now, 10)),
      deadline: toInputDate(addDays(now, 16)),
      sourceFileName: "problem-solving-sprint.pptx",
      applications: [],
      logs: [createLog("공개 대기 중인 샘플 과정입니다.")],
    },
  ]
}

export default function SamsungDsPrototype({ coaches }: SamsungDsPrototypeProps) {
  const fallbackCoaches = useMemo<CoachOption[]>(
    () =>
      coaches.length > 0
        ? coaches
        : [
            { id: "sample-1", name: "김다은" },
            { id: "sample-2", name: "박지호" },
            { id: "sample-3", name: "이서윤" },
          ],
    [coaches]
  )

  const [courses, setCourses] = useState<CourseEntry[]>(() => buildInitialCourses(fallbackCoaches))
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null)
  const [selectedApplicantIds, setSelectedApplicantIds] = useState<string[]>([])

  const coachMap = useMemo(
    () => new Map(fallbackCoaches.map((coach) => [coach.id, coach])),
    [fallbackCoaches]
  )

  const sortedCourses = useMemo(
    () => [...courses].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title)),
    [courses]
  )

  function updateCourse(courseId: string, updater: (course: CourseEntry) => CourseEntry) {
    setCourses((prev) => prev.map((course) => (course.id === courseId ? updater(course) : course)))
  }

  function getConflicts(course: CourseEntry, coachId: string) {
    return sortedCourses.filter((otherCourse) => {
      if (otherCourse.id === course.id) return false
      if (!overlaps(course, otherCourse)) return false
      return otherCourse.applications.some(
        (application) => application.coachId === coachId && application.status === "confirmed"
      )
    })
  }

  function confirmApplicants(courseId: string, coachIds: string[]) {
    const course = sortedCourses.find((item) => item.id === courseId)
    if (!course || coachIds.length === 0) return

    const warnings = coachIds.flatMap((coachId) =>
      getConflicts(course, coachId).map(
        (conflictCourse) => `${coachMap.get(coachId)?.name ?? coachId}: ${conflictCourse.title}`
      )
    )

    const confirmed = window.confirm(
      warnings.length > 0
        ? `일정이 겹치는 확정 건이 있습니다.\n\n${warnings.join("\n")}\n\n경고를 확인하고 계속 확정할까요?`
        : `${coachIds.length}명의 코치를 확정할까요?`
    )
    if (!confirmed) return

    updateCourse(courseId, (current) => {
      const currentTime = new Date().toISOString()
      return {
        ...current,
        applications: current.applications.map((application) =>
          coachIds.includes(application.coachId) && application.status === "applied"
            ? {
                ...application,
                status: "confirmed" as const,
                updatedAt: currentTime,
                confirmedAt: currentTime,
              }
            : application
        ),
        logs: [createLog(`${coachIds.length}명의 코치를 확정했습니다.`), ...current.logs],
      }
    })

    setSelectedApplicantIds([])
  }

  function handleManagerCancel(courseId: string, coachId: string) {
    const course = sortedCourses.find((item) => item.id === courseId)
    const application = course?.applications.find((item) => item.coachId === coachId)
    if (!course || !application) return

    if (application.status === "applied") {
      const confirmed = window.confirm("이 신청 건을 취소 처리할까요?")
      if (!confirmed) return

      updateCourse(courseId, (current) => ({
        ...current,
        applications: current.applications.map((entry) =>
          entry.coachId === coachId
            ? {
                ...entry,
                status: "cancelled" as const,
                updatedAt: new Date().toISOString(),
                confirmedAt: null,
              }
            : entry
        ),
        logs: [
          createLog(`${coachMap.get(coachId)?.name ?? coachId} 코치 신청을 관리자가 취소 처리했습니다.`),
          ...current.logs,
        ],
      }))
      return
    }

    const confirmed = window.confirm("확정을 취소하고 다시 신청 상태로 돌릴까요?")
    if (!confirmed) return

    updateCourse(courseId, (current) => {
      const currentTime = new Date().toISOString()
      return {
        ...current,
        applications: current.applications.map((entry) =>
          entry.coachId === coachId
            ? {
                ...entry,
                status: "applied" as const,
                appliedAt: currentTime,
                updatedAt: currentTime,
                confirmedAt: null,
              }
            : entry
        ),
        logs: [
          createLog(`${coachMap.get(coachId)?.name ?? coachId} 코치 확정을 취소하고 신청 상태로 복귀시켰습니다.`),
          ...current.logs,
        ],
      }
    })
  }

  function toggleCourse(courseId: string) {
    setSelectedCourseId((prev) => (prev === courseId ? null : courseId))
    setSelectedApplicantIds([])
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <section className="overflow-hidden rounded-3xl border border-[#E5E7EB] bg-white">
        <div className="grid grid-cols-[132px_minmax(0,1fr)_72px] bg-[#F8FAFC] px-4 py-3 text-xs font-semibold text-[#64748B] sm:grid-cols-[160px_minmax(0,1fr)_80px]">
          <div>날짜</div>
          <div>과정명</div>
          <div className="text-right">신청</div>
        </div>

        {sortedCourses.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-[#64748B]">표시할 과정이 없습니다.</div>
        )}

        {sortedCourses.map((course) => {
          const isOpen = selectedCourseId === course.id
          const appliedCount = course.applications.filter((item) => item.status === "applied").length
          const activeApplicantCount = course.applications.filter((item) => item.status !== "cancelled").length
          const confirmedCount = course.applications.filter((item) => item.status === "confirmed").length
          const sortedApplications = [...course.applications].sort((a, b) => a.appliedAt.localeCompare(b.appliedAt))

          return (
            <div key={course.id} className="border-t border-[#E5E7EB]">
              <button
                type="button"
                onClick={() => toggleCourse(course.id)}
                className={`grid w-full grid-cols-[132px_minmax(0,1fr)_72px] items-center px-4 py-4 text-left text-sm transition sm:grid-cols-[160px_minmax(0,1fr)_80px] ${
                  isOpen ? "bg-[#F8FAFC]" : "bg-white hover:bg-[#FAFAFA]"
                }`}
              >
                <div className="text-[#64748B]">
                  {toDateLabel(course.startDate)}~{toDateLabel(course.endDate)}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-medium text-[#111827]">{course.title}</div>
                </div>
                <div className="text-right text-[#64748B]">{activeApplicantCount}명</div>
              </button>

              {isOpen && (
                <div className="border-t border-[#E5E7EB] bg-[#FCFCFD] px-4 py-4 sm:px-5">
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#6B7280]">
                      <span>{toDateLabel(course.startDate)}~{toDateLabel(course.endDate)}</span>
                      <span>{course.time}</span>
                      <span>{appliedCount}명 신청</span>
                      <span>{confirmedCount}명 확정</span>
                    </div>
                    <div className="whitespace-pre-line rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-[#475569]">
                      {course.curriculum}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-sm text-[#64748B]">신청순으로 표시됩니다.</div>
                    <button
                      type="button"
                      disabled={selectedApplicantIds.length === 0}
                      onClick={() => confirmApplicants(course.id, selectedApplicantIds)}
                      className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                        selectedApplicantIds.length === 0
                          ? "cursor-not-allowed bg-[#E5E7EB] text-[#9CA3AF]"
                          : "cursor-pointer bg-[#1565C0] text-white"
                      }`}
                    >
                      선택 항목 확정
                    </button>
                  </div>

                  <div className="mt-4 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
                    <div className="hidden grid-cols-[44px_minmax(0,1fr)_112px_148px_148px] bg-[#F8FAFC] px-4 py-3 text-xs font-semibold text-[#64748B] sm:grid">
                      <div />
                      <div>이름</div>
                      <div>상태</div>
                      <div>신청 시각</div>
                      <div>액션</div>
                    </div>

                    {sortedApplications.length === 0 && (
                      <div className="px-4 py-8 text-center text-sm text-[#64748B]">신청한 코치가 없습니다.</div>
                    )}

                    {sortedApplications.map((application) => {
                      const coach = coachMap.get(application.coachId)
                      const isSelectable = application.status === "applied"

                      return (
                        <div
                          key={application.coachId}
                          className="border-t border-[#E5E7EB] first:border-t-0 sm:grid sm:grid-cols-[44px_minmax(0,1fr)_112px_148px_148px] sm:items-center sm:px-4 sm:py-3"
                        >
                          <div className="flex items-start gap-3 px-4 py-4 sm:block sm:px-0 sm:py-0">
                            <div className="pt-0.5">
                              {isSelectable ? (
                                <input
                                  type="checkbox"
                                  checked={selectedApplicantIds.includes(application.coachId)}
                                  onChange={(event) => {
                                    setSelectedApplicantIds((prev) =>
                                      event.target.checked
                                        ? [...prev, application.coachId]
                                        : prev.filter((value) => value !== application.coachId)
                                    )
                                  }}
                                />
                              ) : (
                                <div className="h-4 w-4" />
                              )}
                            </div>

                            <div className="min-w-0 flex-1 sm:hidden">
                              <div className="flex items-center justify-between gap-3">
                                <div className="truncate font-medium text-[#111827]">
                                  {coach?.name ?? application.coachId}
                                </div>
                                <span
                                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClasses(application.status)}`}
                                >
                                  {getStatusLabel(application.status)}
                                </span>
                              </div>
                              <div className="mt-1 text-xs text-[#64748B]">
                                {toDateTimeLabel(application.appliedAt)}
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {application.status === "applied" && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => confirmApplicants(course.id, [application.coachId])}
                                      className="rounded-lg bg-[#1565C0] px-3 py-1.5 text-xs font-semibold text-white"
                                    >
                                      확정
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleManagerCancel(course.id, application.coachId)}
                                      className="rounded-lg border border-[#D1D5DB] px-3 py-1.5 text-xs font-semibold text-[#475569]"
                                    >
                                      취소 처리
                                    </button>
                                  </>
                                )}
                                {application.status === "confirmed" && (
                                  <button
                                    type="button"
                                    onClick={() => handleManagerCancel(course.id, application.coachId)}
                                    className="rounded-lg border border-[#F59E0B] px-3 py-1.5 text-xs font-semibold text-[#B45309]"
                                  >
                                    확정 취소
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="hidden font-medium text-[#111827] sm:block">
                            {coach?.name ?? application.coachId}
                          </div>
                          <div className="hidden sm:block">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClasses(application.status)}`}
                            >
                              {getStatusLabel(application.status)}
                            </span>
                          </div>
                          <div className="hidden text-[#64748B] sm:block">
                            {toDateTimeLabel(application.appliedAt)}
                          </div>
                          <div className="hidden gap-2 sm:flex">
                            {application.status === "applied" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => confirmApplicants(course.id, [application.coachId])}
                                  className="rounded-lg bg-[#1565C0] px-3 py-1.5 text-xs font-semibold text-white"
                                >
                                  확정
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleManagerCancel(course.id, application.coachId)}
                                  className="rounded-lg border border-[#D1D5DB] px-3 py-1.5 text-xs font-semibold text-[#475569]"
                                >
                                  취소 처리
                                </button>
                              </>
                            )}
                            {application.status === "confirmed" && (
                              <button
                                type="button"
                                onClick={() => handleManagerCancel(course.id, application.coachId)}
                                className="rounded-lg border border-[#F59E0B] px-3 py-1.5 text-xs font-semibold text-[#B45309]"
                              >
                                확정 취소
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </section>
    </div>
  )
}
