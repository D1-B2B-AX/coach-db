"use client"

import type { HTMLAttributes, ReactNode } from "react"

type BadgeVariant = "status" | "category"
type BadgeTone = "blue" | "orange" | "green" | "gray" | "teal" | "purple" | "amber" | "red"

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  tone?: BadgeTone
  children: ReactNode
}

const STATUS_TONE_CLASS: Record<BadgeTone, string> = {
  blue: "bg-[#E3F2FD] text-[#1565C0]",
  orange: "bg-[#FFF3E0] text-[#C85E00]",
  green: "bg-[#E8F5E9] text-[#2E7D32]",
  gray: "bg-[#ECEFF1] text-[#455A64]",
  teal: "bg-[#E0F2F1] text-[#00695C]",
  purple: "bg-[#F3E5F5] text-[#6A1B9A]",
  amber: "bg-[#FFF8E1] text-[#E65100]",
  red: "bg-[#FFEBEE] text-[#C62828]",
}

const CATEGORY_TONE_CLASS: Record<BadgeTone, string> = {
  blue: "bg-[#E3F2FD] text-[#0D47A1]",
  orange: "bg-[#FFF3E0] text-[#E65100]",
  green: "bg-[#E8F5E9] text-[#2E7D32]",
  gray: "bg-[#ECEFF1] text-[#455A64]",
  teal: "bg-[#E0F2F1] text-[#00695C]",
  purple: "bg-[#F3E5F5] text-[#7B1FA2]",
  amber: "bg-[#FFF8E1] text-[#F57C00]",
  red: "bg-[#FFEBEE] text-[#C62828]",
}

export default function Badge({
  variant = "status",
  tone = "gray",
  className = "",
  children,
  ...props
}: BadgeProps) {
  const base =
    variant === "status"
      ? "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
      : "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"

  const toneClass = variant === "status" ? STATUS_TONE_CLASS[tone] : CATEGORY_TONE_CLASS[tone]

  return (
    <span className={`${base} ${toneClass} ${className}`} {...props}>
      {children}
    </span>
  )
}
