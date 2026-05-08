import { redirect } from "next/navigation"
import { requireAdmin } from "@/lib/api-auth"
import DxTabNav from "./DxTabNav"

export default async function SamsungDxLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAdmin()
  if (!auth) redirect("/403")

  return (
    <>
      <DxTabNav />
      {children}
    </>
  )
}
