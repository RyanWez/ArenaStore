/**
 * Timezone & Datetime formatting utilities for Arena Store Admin Portal.
 * Pinned to Myanmar Standard Time (Asia/Yangon, UTC+06:30) to avoid client-side
 * timezone skew when administrators are connected via foreign VPNs/proxies.
 */

export const MYANMAR_TIMEZONE = 'Asia/Yangon'

/**
 * Formats a date into a clean Myanmar Time string with context (e.g., "Today, 10:57 AM" or "03 Oct 2026, 10:57 AM").
 */
export function formatMyanmarDateTime(dateVal?: string | Date | null): string {
  if (!dateVal) return '-'
  try {
    const d = typeof dateVal === 'string' ? new Date(dateVal) : dateVal
    if (isNaN(d.getTime())) return '-'

    const now = new Date()
    const dStr = new Intl.DateTimeFormat('en-CA', { timeZone: MYANMAR_TIMEZONE }).format(d)
    const nowStr = new Intl.DateTimeFormat('en-CA', { timeZone: MYANMAR_TIMEZONE }).format(now)

    const timeStr = new Intl.DateTimeFormat('en-US', {
      timeZone: MYANMAR_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(d)

    if (dStr === nowStr) {
      return `Today, ${timeStr}`
    }

    const currentYear = new Intl.DateTimeFormat('en-US', { timeZone: MYANMAR_TIMEZONE, year: 'numeric' }).format(now)
    const dateYear = new Intl.DateTimeFormat('en-US', { timeZone: MYANMAR_TIMEZONE, year: 'numeric' }).format(d)

    if (currentYear === dateYear) {
      const dateStr = new Intl.DateTimeFormat('en-GB', {
        timeZone: MYANMAR_TIMEZONE,
        day: '2-digit',
        month: 'short',
      }).format(d)
      return `${dateStr}, ${timeStr}`
    }

    const fullDateStr = new Intl.DateTimeFormat('en-GB', {
      timeZone: MYANMAR_TIMEZONE,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(d)
    return `${fullDateStr}, ${timeStr}`
  } catch {
    return String(dateVal)
  }
}

/**
 * Formats only the time component in Myanmar Time (e.g., "10:57 AM").
 */
export function formatMyanmarTime(dateVal?: string | Date | null): string {
  if (!dateVal) return '-'
  try {
    const d = typeof dateVal === 'string' ? new Date(dateVal) : dateVal
    if (isNaN(d.getTime())) return '-'
    return new Intl.DateTimeFormat('en-US', {
      timeZone: MYANMAR_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(d)
  } catch {
    return '-'
  }
}

/**
 * Formats only the date component in Myanmar Time (e.g., "03 Oct 2026").
 */
export function formatMyanmarDate(dateVal?: string | Date | null): string {
  if (!dateVal) return '-'
  try {
    const d = typeof dateVal === 'string' ? new Date(dateVal) : dateVal
    if (isNaN(d.getTime())) return '-'
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: MYANMAR_TIMEZONE,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(d)
  } catch {
    return '-'
  }
}

/**
 * Formats a timestamp into a relative time description (e.g. "Just now", "2 mins ago", "1 hour ago").
 */
export function formatRelativeTime(dateVal?: string | Date | null): string {
  if (!dateVal) return 'Never'
  try {
    const d = typeof dateVal === 'string' ? new Date(dateVal) : dateVal
    if (isNaN(d.getTime())) return 'Never'
    const now = Date.now()
    const diffMs = now - d.getTime()
    if (diffMs < 0) return 'Just now'
    const diffSec = Math.floor(diffMs / 1000)
    if (diffSec < 45) return 'Just now'
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin} min${diffMin === 1 ? '' : 's'} ago`
    const diffHours = Math.floor(diffMin / 60)
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
  } catch {
    return 'Never'
  }
}

/**
 * Returns the YYYY-MM-DD date string in Myanmar timezone (UTC+06:30).
 */
export function getMyanmarDateString(dateVal?: string | Date | null): string {
  if (!dateVal) return ''
  try {
    const d = typeof dateVal === 'string' ? new Date(dateVal) : dateVal
    if (isNaN(d.getTime())) return ''
    return new Intl.DateTimeFormat('en-CA', { timeZone: MYANMAR_TIMEZONE }).format(d)
  } catch {
    return ''
  }
}

/**
 * Returns today's YYYY-MM-DD in Myanmar timezone.
 */
export function getTodayMyanmarDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: MYANMAR_TIMEZONE }).format(new Date())
}

export type DateFilterPreset = 'ALL' | 'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS' | 'THIS_MONTH' | 'CUSTOM'

/**
 * Checks whether a timestamp matches the selected date filter preset in Myanmar timezone.
 */
export function matchesMyanmarDateFilter(
  dateVal: string | Date | null | undefined,
  filter: DateFilterPreset,
  customDate?: string // YYYY-MM-DD
): boolean {
  if (filter === 'ALL') return true
  if (!dateVal) return false
  const targetDateStr = getMyanmarDateString(dateVal)
  if (!targetDateStr) return false

  const todayStr = getTodayMyanmarDate()

  if (filter === 'TODAY') {
    return targetDateStr === todayStr
  }

  if (filter === 'YESTERDAY') {
    const now = new Date()
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const yesterdayStr = new Intl.DateTimeFormat('en-CA', { timeZone: MYANMAR_TIMEZONE }).format(yesterday)
    return targetDateStr === yesterdayStr
  }

  if (filter === 'LAST_7_DAYS') {
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const sevenDaysAgoStr = new Intl.DateTimeFormat('en-CA', { timeZone: MYANMAR_TIMEZONE }).format(sevenDaysAgo)
    return targetDateStr >= sevenDaysAgoStr && targetDateStr <= todayStr
  }

  if (filter === 'THIS_MONTH') {
    return targetDateStr.slice(0, 7) === todayStr.slice(0, 7)
  }

  if (filter === 'CUSTOM' && customDate) {
    return targetDateStr === customDate
  }

  return true
}

