import Link from "next/link"

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <p className="text-6xl font-bold text-gray-200">404</p>
        <p className="mt-4 text-sm text-gray-500">페이지를 찾을 수 없습니다</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-[#1976D2] px-4 py-2 text-sm font-medium text-white hover:bg-[#1565C0] transition-colors"
        >
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  )
}
