import DxTabNav from "./DxTabNav"

export default function SamsungDxLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DxTabNav />
      {children}
    </>
  )
}
