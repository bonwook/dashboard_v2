/**
 * Rate Limiting 미들웨어
 * Brute Force 공격 방어
 */

interface RateLimitStore {
  [key: string]: {
    count: number
    resetTime: number
  }
}

// In-memory store (프로덕션에서는 Redis 사용 권장)
const store: RateLimitStore = {}

// 주기적으로 만료된 항목 정리 (메모리 누수 방지)
setInterval(() => {
  const now = Date.now()
  for (const key in store) {
    if (store[key].resetTime < now) {
      delete store[key]
    }
  }
}, 60000) // 1분마다 정리

interface RateLimitOptions {
  windowMs?: number // 시간 윈도우 (밀리초)
  maxRequests?: number // 최대 요청 수
  keyGenerator?: (req: Request) => string // 키 생성 함수
}

const defaultOptions: Required<RateLimitOptions> = {
  windowMs: 15 * 60 * 1000, // 15분
  maxRequests: 100, // 최대 100회
  keyGenerator: (req: Request) => {
    // IP 주소 기반 (프록시 환경에서는 X-Forwarded-For 사용)
    const forwarded = req.headers.get("x-forwarded-for")
    const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown"
    return ip
  },
}

/**
 * Rate Limiting 미들웨어
 * @param options Rate limiting 옵션
 * @returns Rate limit 체크 함수
 */
export function createRateLimiter(options: RateLimitOptions = {}) {
  const opts = { ...defaultOptions, ...options }

  return async (req: Request): Promise<{ allowed: boolean; remaining: number; resetTime: number }> => {
    const key = opts.keyGenerator(req)
    const now = Date.now()

    // 기존 항목이 없거나 만료된 경우 새로 생성
    if (!store[key] || store[key].resetTime < now) {
      store[key] = {
        count: 1,
        resetTime: now + opts.windowMs,
      }
      return {
        allowed: true,
        remaining: opts.maxRequests - 1,
        resetTime: store[key].resetTime,
      }
    }

    // 요청 수 증가
    store[key].count++

    // 최대 요청 수 초과 시 차단
    if (store[key].count > opts.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: store[key].resetTime,
      }
    }

    return {
      allowed: true,
      remaining: opts.maxRequests - store[key].count,
      resetTime: store[key].resetTime,
    }
  }
}

/**
 * 인증 관련 엔드포인트용 Rate Limiter (더 엄격)
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5분
  maxRequests: 10, // 최대 10회 (Brute Force 방어)
  keyGenerator: (req: Request) => {
    // IP + User-Agent 조합으로 더 정확한 식별
    const forwarded = req.headers.get("x-forwarded-for")
    const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown"
    const userAgent = req.headers.get("user-agent") || "unknown"
    return `auth:${ip}:${userAgent}`
  },
})

/**
 * 일반 API 엔드포인트용 Rate Limiter
 */
export const apiRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15분
  maxRequests: 100, // 최대 100회
})
