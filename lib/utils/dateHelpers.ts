import { addDays, format, startOfDay, endOfDay, differenceInCalendarDays } from "date-fns"
import { ko } from "date-fns/locale"

/** YYYY-MM-DD 형태인지 확인 */
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

/**
 * DATE 전용 파싱 (YYYY-MM-DD). UTC 자정이 아닌 로컬 자정으로 해석해 타임존에 따라 날짜가 밀리지 않도록 함.
 * due_date 등 DATE 컬럼 값 파싱 시 사용.
 */
export function parseDateOnly(value: Date | string | null | undefined): Date | null {
  if (value == null || value === "") return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const s = String(value).trim()
  if (!DATE_ONLY_REGEX.test(s)) return null
  const [y, m, d] = s.split("-").map(Number)
  if (y < 1970 || m < 1 || m > 12 || d < 1 || d > 31) return null
  const date = new Date(y, m - 1, d)
  return date
}

/**
 * API 등에서 오는 날짜 값을 일관되게 Date로 변환.
 * - "YYYY-MM-DD" → 로컬 그날 자정 (parseDateOnly)
 * - 그 외(ISO, "YYYY-MM-DD HH:MM:SS" 등) → new Date()
 */
export function parseFlexibleDate(value: Date | string | null | undefined): Date | null {
  if (value == null || value === "") return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const s = String(value).trim()
  if (DATE_ONLY_REGEX.test(s)) return parseDateOnly(s)
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * 업로드 날짜로부터 7일 후의 만료일을 계산 (파일별 독립, 첨부 시점 기준).
 * - 업로드일·만료일은 '날짜' 기준(자정~자정)으로 계산.
 * - uploadedAt이 없으면 만료로 간주. 파싱 실패 시 만료로 간주.
 */
export function calculateFileExpiry(uploadedAt: Date | string | null | undefined): {
  expiresAt: Date
  daysRemaining: number
  isExpired: boolean
  expiryText: string
} {
  if (uploadedAt == null || uploadedAt === "") {
    return {
      expiresAt: new Date(0),
      daysRemaining: -1,
      isExpired: true,
      expiryText: "만료됨",
    }
  }

  const uploaded = parseFlexibleDate(uploadedAt)
  if (!uploaded || uploaded.getTime() <= 0) {
    return {
      expiresAt: new Date(0),
      daysRemaining: -1,
      isExpired: true,
      expiryText: "만료됨",
    }
  }
  const uploadDay = startOfDay(uploaded)
  const expiryEndOfDay = endOfDay(addDays(uploadDay, 7))
  const now = new Date()
  const daysRemaining = differenceInCalendarDays(expiryEndOfDay, now)
  const isExpired = now > expiryEndOfDay

  let expiryText = ""
  if (isExpired) {
    expiryText = "만료됨"
  } else if (daysRemaining === 0) {
    expiryText = "오늘 만료"
  } else if (daysRemaining === 1) {
    expiryText = "1일 남음"
  } else {
    expiryText = `${daysRemaining}일 남음`
  }

  return {
    expiresAt: expiryEndOfDay,
    daysRemaining: isExpired ? -1 : daysRemaining,
    isExpired,
    expiryText,
  }
}

/**
 * 날짜를 yyyy.MM.dd 형식으로 포맷 (DATE/datetime 일관 파싱)
 */
export function formatDateShort(date: Date | string | null | undefined): string {
  const d = parseFlexibleDate(date)
  if (!d) return "-"
  return format(d, "yyyy.MM.dd", { locale: ko })
}

/**
 * 날짜를 yyyy.MM.dd HH:mm 형식으로 포맷 (DATE/datetime 일관 파싱)
 */
export function formatDateTimeMedium(date: Date | string | null | undefined): string {
  const d = parseFlexibleDate(date)
  if (!d) return "-"
  return format(d, "yyyy.MM.dd HH:mm", { locale: ko })
}
