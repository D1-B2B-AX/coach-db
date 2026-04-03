"use client"

import type { ButtonHTMLAttributes, ReactNode } from "react"

type RemovableChipTone = "blue" | "purple"
type RemovableChipSize = "sm" | "xs"

interface RemovableChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: RemovableChipTone
  size?: RemovableChipSize
  children: ReactNode
  onRemove: () => void
}

const TONE_CLASS: Record<RemovableChipTone, string> = {
  blue: "bg-[#E3F2FD] text-[#1976D2] hover:bg-[#D6ECFF]",
  purple: "bg-[#F3E5F5] text-[#7B1FA2] hover:bg-[#E8DAEF]",
}

const SIZE_CLASS: Record<RemovableChipSize, string> = {
  sm: "px-3 py-1 text-sm",
  xs: "px-2.5 py-1 text-[11px]",
}

export default function RemovableChip({
  tone = "blue",
  size = "sm",
  children,
  onRemove,
  className = "",
  type = "button",
  ...props
}: RemovableChipProps) {
  return (
    <button
      type={type}
      onClick={onRemove}
      className={`inline-flex items-center gap-1 rounded-full font-medium transition-colors ${SIZE_CLASS[size]} ${TONE_CLASS[tone]} ${className}`}
      {...props}
    >
      <span>{children}</span>
      <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  )
}
