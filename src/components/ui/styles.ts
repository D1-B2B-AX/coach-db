export const CARD_BORDER_RADIUS = "rounded-2xl"
export const CARD_BORDER_COLOR = "border-gray-100"
export const CONTROL_BORDER_RADIUS = "rounded-lg"
export const CONTROL_BORDER_COLOR = "border-gray-200"
export const FILTER_PILL_BASE = "inline-flex cursor-pointer items-center rounded-full border px-2 py-1 text-[11px] font-medium transition-colors"

export const PRIMARY_COLOR = "#1976D2"
export const PRIMARY_HOVER_COLOR = "#1565C0"
export const PRIMARY_LIGHT_BORDER = "#B7D4F6"
export const PRIMARY_LIGHT_BG = "#EAF3FE"
export const PRIMARY_LIGHT_HOVER = "#DCECFD"

export const BUTTON_BASE_CLASS =
  "cursor-pointer inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"

export const BUTTON_VARIANT_CLASS = {
  primary: `border border-[${PRIMARY_COLOR}] bg-[${PRIMARY_COLOR}] text-white hover:bg-[${PRIMARY_HOVER_COLOR}]`,
  secondary: `border ${CONTROL_BORDER_COLOR} bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-800`,
  primaryOutline: `border border-[${PRIMARY_LIGHT_BORDER}] bg-[${PRIMARY_LIGHT_BG}] text-[${PRIMARY_COLOR}] hover:bg-[${PRIMARY_LIGHT_HOVER}]`,
  ghost: "border-transparent bg-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-700",
}

export const SURFACE_CARD_CLASS =
  `${CARD_BORDER_RADIUS} bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border ${CARD_BORDER_COLOR}`

export const CONTROL_CLASS =
  `${CONTROL_BORDER_RADIUS} border ${CONTROL_BORDER_COLOR} bg-white`

export const TABLE_DIVIDER_COLOR = "border-gray-100"

export const TABLE_HEADER_CLASS =
  `items-center gap-2 border-b ${CONTROL_BORDER_COLOR} bg-[#FAFBFC] px-4 py-3 text-xs font-semibold text-[#6B7280]`

export const TABLE_ROW_CLASS =
  `items-center gap-2 border-b ${TABLE_DIVIDER_COLOR} px-4 py-3 transition-colors`

export const TABLE_EMPTY_CLASS =
  "px-5 py-8 text-center text-sm text-gray-400"
