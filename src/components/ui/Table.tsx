"use client"

import type { HTMLAttributes, ReactNode } from "react"
import { SURFACE_CARD_CLASS, TABLE_EMPTY_CLASS, TABLE_HEADER_CLASS, TABLE_ROW_CLASS } from "@/components/ui/styles"

interface TableProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function Table({ children, className = "", ...props }: TableProps) {
  return (
    <div className={`${SURFACE_CARD_CLASS} ${className}`} {...props}>
      {children}
    </div>
  )
}

interface TableHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function TableHeader({ children, className = "", ...props }: TableHeaderProps) {
  return (
    <div className={`${TABLE_HEADER_CLASS} ${className}`} {...props}>
      {children}
    </div>
  )
}

interface TableRowProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  selected?: boolean
}

export function TableRow({ children, selected = false, className = "", ...props }: TableRowProps) {
  return (
    <div
      className={`${TABLE_ROW_CLASS} ${selected ? "bg-[#F7FAFD]" : ""} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

interface TableEmptyProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function TableEmpty({ children, className = "", ...props }: TableEmptyProps) {
  return (
    <div className={`${TABLE_EMPTY_CLASS} ${className}`} {...props}>
      {children}
    </div>
  )
}
