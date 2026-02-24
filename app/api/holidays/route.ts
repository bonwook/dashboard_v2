import { type NextRequest, NextResponse } from "next/server"

// 공휴일 데이터 캐시 (메모리 캐시)
const holidayCache: Map<string, { data: any[], cachedAt: number }> = new Map()
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24시간

// GET /api/holidays - 공공데이터포털 특일정보(공휴일) API 연동
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const year = searchParams.get("year")
    const month = searchParams.get("month")

    if (!year) {
      return NextResponse.json({ error: "year is required" }, { status: 400 })
    }

    // API 키 확인
    const apiKey = process.env.HOLIDAY_API_KEY
    if (!apiKey) {
      // API 키가 없으면 빈 배열 반환 (하드코딩된 데이터로 폴백)
      return NextResponse.json({ holidays: [] })
    }

    // 캐시 키 생성
    const cacheKey = month ? `${year}-${month}` : year
    const now = Date.now()

    // 캐시 확인
    const cached = holidayCache.get(cacheKey)
    if (cached && now - cached.cachedAt < CACHE_DURATION) {
      return NextResponse.json({ holidays: cached.data })
    }

    // 공공데이터포털 API 호출
    const params = new URLSearchParams({
      ServiceKey: apiKey,
      solYear: year,
      _type: "json",
      numOfRows: "100",
    })

    // 월이 지정된 경우 해당 월만 조회
    if (month) {
      params.append("solMonth", month.padStart(2, "0"))
    }

    const apiUrl = `http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?${params.toString()}`

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    })

    if (!response.ok) {
      console.error(`[Holiday API] HTTP error: ${response.status}`)
      const errorText = await response.text()
      console.error(`[Holiday API] Error response: ${errorText.substring(0, 200)}`)
      return NextResponse.json({ holidays: [] })
    }

    const data = await response.json()

    // API 응답 구조 확인 및 파싱
    let holidays: any[] = []
    
    if (data?.response?.body?.items?.item) {
      const items = data.response.body.items.item
      holidays = Array.isArray(items) ? items : [items]
    }

    // 캐시에 저장
    holidayCache.set(cacheKey, {
      data: holidays,
      cachedAt: now,
    })

    return NextResponse.json({ holidays })
  } catch (error: unknown) {
    console.error("[Holiday API] Error:", error)
    // 에러 발생 시 빈 배열 반환 (서비스 중단 방지)
    return NextResponse.json({ holidays: [] })
  }
}
