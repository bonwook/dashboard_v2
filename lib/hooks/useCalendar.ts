import { useState, useCallback, useMemo } from "react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from "date-fns"

export interface CalendarTasks {
  assigned: any[]
  received: any[]
}

export interface UseCalendarOptions {
  /** staff 전용: true면 내 업무만, false/미설정이면 전체 태스크 */
  assignedToMeOnly?: boolean
}

export function useCalendar(options: UseCalendarOptions = {}) {
  const { assignedToMeOnly = false } = options
  const [calendarDate, setCalendarDate] = useState<Date>(new Date())
  const [calendarTasks, setCalendarTasks] = useState<Record<string, CalendarTasks>>({})
  const [holidays, setHolidays] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)

  // 캘린더 날짜 포맷팅
  const formatCalendarDate = useCallback((date: Date) => {
    return format(date, 'yyyy-MM-dd')
  }, [])

  // Asia/Korea 시간대 기준 오늘 날짜
  const getTodayInKorea = useCallback(() => {
    const now = new Date()
    const koreaDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }))
    return format(koreaDate, 'yyyy-MM-dd')
  }, [])

  // 캘린더 날짜에 task가 있는지 확인
  const getDayTasks = useCallback((date: Date) => {
    const dateStr = formatCalendarDate(date)
    return calendarTasks[dateStr] || { assigned: [], received: [] }
  }, [calendarTasks, formatCalendarDate])

  // 월 변경 함수
  const changeMonth = useCallback((delta: number) => {
    setCalendarDate(prevDate => {
      const newDate = new Date(prevDate)
      newDate.setMonth(newDate.getMonth() + delta)
      return newDate
    })
  }, [])

  // 캘린더 날짜 배열 생성
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(calendarDate)
    const monthEnd = endOfMonth(calendarDate)
    const startDate = new Date(monthStart)
    startDate.setDate(startDate.getDate() - getDay(monthStart))
    
    const endDate = new Date(monthEnd)
    endDate.setDate(endDate.getDate() + (6 - getDay(monthEnd)))
    
    return eachDayOfInterval({ start: startDate, end: endDate })
  }, [calendarDate])

  // 캘린더 데이터 로드
  const loadCalendarData = useCallback(async () => {
    try {
      const year = calendarDate.getFullYear()
      const month = calendarDate.getMonth() + 1
      
      // Tasks 로드 (staff는 assignedToMeOnly에 따라 전체/내 업무만)
      const qs = new URLSearchParams({ year: String(year), month: String(month) })
      if (assignedToMeOnly) qs.set("assignedToMeOnly", "true")
      const calendarRes = await fetch(`/api/tasks/calendar?${qs.toString()}`, {
        credentials: "include",
        cache: "no-store",
      })
      if (calendarRes.ok) {
        const calendarData = await calendarRes.json()
        setCalendarTasks(calendarData.tasksByDate || {})
      }

      // 공휴일 로드
      try {
        const holidayRes = await fetch(`/api/holidays?year=${year}&month=${month}`, {
          credentials: "include",
          cache: "no-store",
        })
        if (holidayRes.ok) {
          const holidayData = await holidayRes.json()
          const holidayMap: Record<string, string> = {}
          
          if (holidayData.holidays && Array.isArray(holidayData.holidays)) {
            holidayData.holidays.forEach((holiday: any) => {
              const dateStr = String(holiday.locdate)
              const formattedDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`
              holidayMap[formattedDate] = holiday.dateName || '공휴일'
            })
          }
          setHolidays(holidayMap)
        } else {
          setHolidays({})
        }
      } catch {
        setHolidays({})
      }
    } catch (error) {
      console.error('[useCalendar] Error loading data:', error)
    } finally {
      setIsLoading(false)
    }
  }, [calendarDate, assignedToMeOnly])

  // 한국 공휴일 확인
  const getKoreanHoliday = useCallback((date: Date): string | null => {
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const day = date.getDate()
    
    const formattedDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
    
    if (holidays[formattedDate]) {
      return holidays[formattedDate]
    }

    // 폴백: 양력 고정 기념일
    const dateStr = `${month}-${day}`
    const fixedHolidays: Record<string, string> = {
      '1-1': '신정',
      '3-1': '삼일절',
      '5-5': '어린이날',
      '6-6': '현충일',
      '8-15': '광복절',
      '10-3': '개천절',
      '10-9': '한글날',
      '12-25': '크리스마스',
    }

    return fixedHolidays[dateStr] || null
  }, [holidays])

  return {
    calendarDate,
    calendarTasks,
    holidays,
    isLoading,
    setIsLoading,
    formatCalendarDate,
    getTodayInKorea,
    getDayTasks,
    changeMonth,
    calendarDays,
    loadCalendarData,
    getKoreanHoliday,
  }
}
