"use client"

import { cloneElement, isValidElement, type ButtonHTMLAttributes, type ReactElement, type ReactNode } from "react"
import { BUTTON_BASE_CLASS, BUTTON_VARIANT_CLASS } from "@/components/ui/styles"

type ButtonSize = "sm" | "md"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof BUTTON_VARIANT_CLASS
  size?: ButtonSize
  children: ReactNode
  asChild?: boolean
}

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1 text-[11px]",
  md: "px-3.5 py-2 text-sm",
}

export default function Button({
  variant = "secondary",
  size = "sm",
  className = "",
  children,
  asChild = false,
  type = "button",
  ...props
}: ButtonProps) {
  const classes = `${BUTTON_BASE_CLASS} ${BUTTON_VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ className?: string }>
    return cloneElement(child, {
      ...props,
      className: `${classes} ${child.props.className || ""}`,
    })
  }

  return (
    <button
      type={type}
      className={classes}
      {...props}
    >
      {children}
    </button>
  )
}
