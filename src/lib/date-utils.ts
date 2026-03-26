/**
 * Convert a date string "YYYY-MM-DD" to a Date object safe from timezone shifts.
 * Uses UTC noon so that any timezone ±12h from UTC still yields the same date.
 *
 * Why: new Date("2026-03-27") → UTC midnight → can shift -1 day when stored
 *      new Date(2026, 2, 27)  → KST midnight → UTC previous day 15:00 → shifts -1 day
 */
export function toDateOnly(dateStr: string): Date {
  return new Date(dateStr + 'T12:00:00Z')
}
