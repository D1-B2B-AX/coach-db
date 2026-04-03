import AccessDeniedPage from "@/components/AccessDeniedPage"

export default function ForbiddenPage() {
  return (
    <AccessDeniedPage
      title="403 Access Denied"
      message="이 페이지를 볼 권한이 없습니다."
      actionLabel="Return to Dashboard"
      actionHref="/dashboard"
    />
  )
}
