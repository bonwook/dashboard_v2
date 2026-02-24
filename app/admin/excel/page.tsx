"use client"

import { useState, useRef, useMemo, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Upload, FileSpreadsheet, X, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import type { ExcelData, ExcelDataWithIndex, ParseResponse } from "@/lib/types"
import { authenticatedFetch } from "@/lib/utils/fetch"
import { safeStorage } from "@/lib/utils/safeStorage"

type SortDirection = "asc" | "desc"

interface SortConfig {
  column: string
  direction: SortDirection
  priority: number // 정렬 우선순위 (낮을수록 먼저 적용)
}

export default function ExcelPage() {
  const [excelData, setExcelData] = useState<ExcelData[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [fileName, setFileName] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const tableContainerRef = useRef<HTMLDivElement>(null)
  
  // 정렬 및 필터링 상태 (다중 정렬 지원)
  const [sorts, setSorts] = useState<SortConfig[]>([])
  const [filters, setFilters] = useState<{ [key: string]: string }>({})
  
  // 셀 강조 상태 (원본 rowIndex-header 형태의 키로 저장)
  const [highlightedCells, setHighlightedCells] = useState<Set<string>>(new Set())
  
  // 드래그 스크롤 상태
  const [isDraggingScroll, setIsDraggingScroll] = useState(false)
  const dragStartRef = useRef<{ x: number; scrollLeft: number; startTime: number } | null>(null)
  const dragDistanceRef = useRef<number>(0)
  const rafRef = useRef<number | null>(null)
  
  // 페이지네이션 상태
  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 50
  
  // 강조 모드 활성화 상태
  const [isHighlightMode, setIsHighlightMode] = useState(false)
  
  // 현재 사용자 ID
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // localStorage 정리 함수 (저장소 접근 불가 환경에서도 예외 없음)
  const clearLocalStorage = () => {
    safeStorage.removeItem('excelViewer_data')
    safeStorage.removeItem('excelViewer_headers')
    safeStorage.removeItem('excelViewer_fileName')
    safeStorage.removeItem('excelViewer_filters')
    safeStorage.removeItem('excelViewer_sorts')
    safeStorage.removeItem('excelViewer_highlightedCells')
    safeStorage.removeItem('excelViewer_currentPage')
  }

  // 모든 데이터 초기화 함수 (먼저 정의)
  const resetAllData = useCallback(() => {
    clearLocalStorage()
    // 모든 상태 초기화 및 메모리 정리
    setExcelData([])
    setHeaders([])
    setFileName("")
    setFilters({})
    setSorts([])
    setHighlightedCells(new Set())
    setCurrentPage(1)
    setIsHighlightMode(false)
    setIsLoading(false)
    setIsDragging(false)
    
    // 파일 입력도 초기화
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
    
    // 강제 가비지 컬렉션 힌트
    if (typeof window !== 'undefined' && (window as any).gc) {
      (window as any).gc()
    }
  }, [])

  // 현재 사용자 ID 가져오기
  useEffect(() => {
    const loadUser = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" })
        if (res.ok) {
          const me = await res.json()
          if (me?.id) setCurrentUserId(me.id)
        } else {
          // 사용자 정보를 가져올 수 없으면 세션 정리
          resetAllData()
        }
      } catch (error) {
        // 인증 오류 시 세션 정리
        console.error('Failed to load user:', error)
        resetAllData()
      }
    }
    loadUser()
  }, [resetAllData])

  // localStorage에서 데이터 복원 (저장소 접근 불가 시 무시)
  useEffect(() => {
    try {
      const savedData = safeStorage.getItem('excelViewer_data')
      const savedHeaders = safeStorage.getItem('excelViewer_headers')
      const savedFileName = safeStorage.getItem('excelViewer_fileName')
      const savedFilters = safeStorage.getItem('excelViewer_filters')
      const savedSorts = safeStorage.getItem('excelViewer_sorts')
      const savedHighlightedCells = safeStorage.getItem('excelViewer_highlightedCells')
      const savedCurrentPage = safeStorage.getItem('excelViewer_currentPage')
      
      if (savedData && savedHeaders) {
        setExcelData(JSON.parse(savedData))
        setHeaders(JSON.parse(savedHeaders))
        if (savedFileName) setFileName(savedFileName)
        if (savedFilters) setFilters(JSON.parse(savedFilters))
        if (savedSorts) setSorts(JSON.parse(savedSorts))
        if (savedHighlightedCells) {
          setHighlightedCells(new Set(JSON.parse(savedHighlightedCells)))
        }
        if (savedCurrentPage) {
          setCurrentPage(parseInt(savedCurrentPage, 10))
        }
      }
    } catch (error) {
      console.error('Failed to load data from localStorage:', error)
    }
  }, [])

  // 토큰 만료 및 네트워크 연결 상태 모니터링
  useEffect(() => {
    if (!currentUserId) return

    // 토큰 만료 감지를 위한 주기적 체크
    const checkAuthStatus = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" })
        if (!res.ok) {
          resetAllData()
          // authenticatedFetch가 자동으로 로그아웃 처리
          return
        }
      } catch (error) {
        // 네트워크 오류나 인증 오류
        console.error('Auth check error:', error)
        resetAllData()
      }
    }

    // 30초마다 토큰 상태 확인
    const authCheckInterval = setInterval(checkAuthStatus, 30000)

    // 네트워크 연결 상태 모니터링
    const handleOnline = () => {
      // 네트워크 재연결 시 토큰 상태 확인
      checkAuthStatus()
    }

    const handleOffline = () => {
      // 네트워크 연결 끊김 시 데이터 정리
      resetAllData()
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      clearInterval(authCheckInterval)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [currentUserId, resetAllData])

  // 로그아웃/창 닫기 시에만 localStorage 정리 (탭 전환은 제외)
  useEffect(() => {
    // beforeunload: 브라우저 종료/탭 닫기 (창 닫기만 감지)
    const handleBeforeUnload = () => {
      clearLocalStorage()
    }

    // unload: 페이지 언로드 (창 닫기 확인)
    const handleUnload = () => {
      clearLocalStorage()
    }

    // storage 이벤트로 로그아웃 감지 (다른 탭에서 loginTime 삭제 시)
    const handleStorageChange = (e: StorageEvent) => {
      // 사용자별 loginTime 키 패턴 확인
      if (e.key && e.key.startsWith('loginTime_') && e.newValue === null) {
        // 현재 사용자의 loginTime이 삭제된 경우에만 정리
        if (currentUserId && e.key === `loginTime_${currentUserId}`) {
          resetAllData()
        }
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('unload', handleUnload)
    window.addEventListener('storage', handleStorageChange)

    // 주기적으로 loginTime 확인 (같은 탭에서 로그아웃 감지, 저장소 접근 불가 환경에서는 예외 없음)
    const checkLoginStatus = setInterval(() => {
      if (currentUserId) {
        const loginTimeKey = `loginTime_${currentUserId}`
        if (!safeStorage.getItem(loginTimeKey)) {
          // 로그아웃 감지 시 모든 데이터 정리
          resetAllData()
          clearInterval(checkLoginStatus)
        }
      }
    }, 1000)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('unload', handleUnload)
      window.removeEventListener('storage', handleStorageChange)
      clearInterval(checkLoginStatus)
      // 컴포넌트 언마운트 시에는 정리하지 않음 (탭 전환일 수 있음)
      // 창 닫기는 beforeunload/unload에서 처리됨
    }
  }, [resetAllData, currentUserId])

  // 데이터 변경 시 localStorage에 저장 (저장소 접근 불가 시 무시)
  useEffect(() => {
    if (excelData.length > 0 && headers.length > 0) {
      safeStorage.setItem('excelViewer_data', JSON.stringify(excelData))
      safeStorage.setItem('excelViewer_headers', JSON.stringify(headers))
      if (fileName) safeStorage.setItem('excelViewer_fileName', fileName)
      safeStorage.setItem('excelViewer_filters', JSON.stringify(filters))
      safeStorage.setItem('excelViewer_sorts', JSON.stringify(sorts))
      safeStorage.setItem('excelViewer_highlightedCells', JSON.stringify(Array.from(highlightedCells)))
      safeStorage.setItem('excelViewer_currentPage', currentPage.toString())
    }
  }, [excelData, headers, fileName, filters, sorts, highlightedCells, currentPage])

  // 각 열의 고유 값 추출 (필터 옵션용)
  const columnUniqueValues = useMemo(() => {
    const uniqueValues: { [key: string]: string[] } = {}
    
    headers.forEach((header) => {
      const values = new Set<string>()
      excelData.forEach((row) => {
        const value = String(row[header] || "").trim()
        if (value) {
          values.add(value)
        }
      })
      uniqueValues[header] = Array.from(values).sort((a, b) => 
        a.localeCompare(b, "ko", { numeric: true })
      )
    })
    
    return uniqueValues
  }, [excelData, headers])

  // 파일 처리 - 서버 API 호출
  const processFile = async (file: File) => {
    // 파일 형식 확인
    const validExtensions = [".xlsx", ".csv"]
    const fileExtension = "." + file.name.split(".").pop()?.toLowerCase()
    
    if (!validExtensions.includes(fileExtension)) {
      alert("엑셀 파일(.xlsx, .csv)만 업로드 가능합니다.")
      return
    }

    // 파일 크기 제한 (50MB = 50 * 1024 * 1024 bytes)
    const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
    if (file.size > MAX_FILE_SIZE) {
      alert(`파일 크기가 너무 큽니다. 최대 ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB까지 업로드 가능합니다.\n현재 파일 크기: ${(file.size / 1024 / 1024).toFixed(2)}MB`)
      return
    }

    setIsLoading(true)
    setFileName(file.name)

    // 이전 데이터 정리 (메모리 절약)
    setExcelData([])
    setHeaders([])

    let formData: FormData | null = null
    let controller: AbortController | null = null

    try {
      // FormData 생성
      formData = new FormData()
      formData.append("file", file)

      // AbortController로 타임아웃 처리 (60초)
      controller = new AbortController()
      const timeoutId = setTimeout(() => controller?.abort(), 60000)

      // 서버 API 호출 (인증 오류 자동 처리)
      const response = await authenticatedFetch("/api/excel/parse", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        let errorMessage = "파일 처리 중 오류가 발생했습니다."
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
        } catch {
          errorMessage = `서버 오류 (${response.status}): ${response.statusText}`
        }
        throw new Error(errorMessage)
      }

      const result: ParseResponse = await response.json()

      if (result.error) {
        alert(result.error)
        setIsLoading(false)
        return
      }

      if (!result.headers || result.headers.length === 0) {
        alert("파일에서 헤더를 찾을 수 없습니다.")
        setIsLoading(false)
        return
      }

      if (!result.data || result.data.length === 0) {
        alert("파일에 데이터가 없습니다.")
        setIsLoading(false)
        return
      }

      setHeaders(result.headers)
      setExcelData(result.data)
      setIsLoading(false)
    } catch (error) {
      console.error("파일 업로드 오류:", error)
      
      // 인증 오류나 네트워크 오류는 authenticatedFetch에서 자동 처리됨
      if (error instanceof Error && error.message === "Authentication failed") {
        // authenticatedFetch가 이미 로그아웃 처리함
        resetAllData()
        return
      }
      
      let errorMessage = "파일 업로드 중 오류가 발생했습니다."
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          errorMessage = "요청 시간이 초과되었습니다. 파일이 너무 크거나 서버 응답이 지연되고 있습니다."
        } else if (error.message.includes("Failed to fetch") || error.message.includes("network")) {
          // 네트워크 오류는 authenticatedFetch에서 자동 처리됨
          resetAllData()
          return
        } else {
          errorMessage = error.message
        }
      }
      
      alert(errorMessage)
      setIsLoading(false)
      setFileName("")
    } finally {
      // 메모리 정리
      formData = null
      controller = null
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    await processFile(file)
  }

  const handleClear = () => {
    // 모든 상태 완전히 초기화
    setExcelData([])
    setHeaders([])
    setFileName("")
    setIsLoading(false)
    setIsDragging(false)
    setSorts([])
    setFilters({})
    setHighlightedCells(new Set())
    setCurrentPage(1)
    setIsHighlightMode(false)
    
    // localStorage 정리
    clearLocalStorage()
    
    // 파일 입력 초기화
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
    
    // 메모리 정리를 위한 강제 가비지 컬렉션 힌트 (가능한 경우)
    if (global.gc && typeof global.gc === 'function') {
      global.gc()
    }
  }

  // 정렬 및 필터링된 데이터 계산 (원본 인덱스 포함)
  const filteredAndSortedData = useMemo(() => {
    // 원본 인덱스를 포함한 데이터 생성
    let result: ExcelDataWithIndex[] = excelData.map((row, originalIndex) => ({
      ...row,
      __originalIndex: originalIndex
    }))

    // 필터링 적용
    if (Object.keys(filters).some(key => filters[key] !== "")) {
      result = result.filter((row) => {
        return Object.entries(filters).every(([column, filterValue]) => {
          if (!filterValue || filterValue === "all") return true
          const cellValue = String(row[column] || "").trim()
          return cellValue === filterValue
        })
      })
    }

    // 다중 정렬 적용 (우선순위 순서대로)
    if (sorts.length > 0) {
      result.sort((a, b) => {
        for (const sort of sorts.sort((s1, s2) => s1.priority - s2.priority)) {
          const aValue = String(a[sort.column] || "")
          const bValue = String(b[sort.column] || "")
          
          // 숫자로 변환 시도
          const aNum = parseFloat(aValue)
          const bNum = parseFloat(bValue)
          const isNumeric = !isNaN(aNum) && !isNaN(bNum) && isFinite(aNum) && isFinite(bNum)
          
          let comparison = 0
          if (isNumeric) {
            comparison = sort.direction === "asc" ? aNum - bNum : bNum - aNum
          } else {
            // 문자열 비교
            comparison = sort.direction === "asc" 
              ? aValue.localeCompare(bValue, "ko", { numeric: true })
              : bValue.localeCompare(aValue, "ko", { numeric: true })
          }
          
          // 현재 정렬 기준에서 차이가 나면 반환, 같으면 다음 정렬 기준 적용
          if (comparison !== 0) {
            return comparison
          }
        }
        return 0
      })
    }

    return result
  }, [excelData, filters, sorts])

  // 페이지네이션 계산
  const totalPages = Math.ceil(filteredAndSortedData.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const paginatedData = filteredAndSortedData.slice(startIndex, endIndex)

  // 필터/정렬 변경 시 첫 페이지로 이동 (초기 로드 제외)
  const isInitialLoad = useRef(true)
  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false
      return
    }
    setCurrentPage(1)
  }, [filters, sorts])

  // 헤더 클릭 시 정렬 처리 (다중 정렬 지원)
  const handleSort = (column: string, event?: React.MouseEvent) => {
    const isShiftKey = event?.shiftKey || false
    
    setSorts((prevSorts) => {
      const existingSortIndex = prevSorts.findIndex(s => s.column === column)
      
      if (existingSortIndex >= 0) {
        const existingSort = prevSorts[existingSortIndex]
        // 같은 컬럼 클릭 시: 오름차순 -> 내림차순 -> 제거
        if (existingSort.direction === "asc") {
          // 내림차순으로 변경
          const newSorts = [...prevSorts]
          newSorts[existingSortIndex] = { ...existingSort, direction: "desc" }
          return newSorts
        } else {
          // 정렬 제거
          const newSorts = prevSorts.filter((_, idx) => idx !== existingSortIndex)
          // 우선순위 재조정
          return newSorts.map((sort, idx) => ({ ...sort, priority: idx }))
        }
      } else {
        // 새로운 정렬 추가
        if (isShiftKey && prevSorts.length > 0) {
          // Shift 키를 누른 경우: 다중 정렬로 추가
          const maxPriority = Math.max(...prevSorts.map(s => s.priority), -1)
          return [...prevSorts, { column, direction: "asc" as SortDirection, priority: maxPriority + 1 }]
        } else {
          // Shift 키를 누르지 않은 경우: 기존 정렬 초기화하고 새로 추가
          return [{ column, direction: "asc" as SortDirection, priority: 0 }]
        }
      }
    })
  }
  
  // 정렬 제거 함수
  const removeSort = (column: string) => {
    setSorts((prevSorts) => {
      const newSorts = prevSorts.filter(s => s.column !== column)
      return newSorts.map((sort, idx) => ({ ...sort, priority: idx }))
    })
  }
  
  // 모든 정렬 초기화
  const clearAllSorts = () => {
    setSorts([])
  }

  // 필터 값 변경 처리
  const handleFilterChange = (column: string, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [column]: value === "all" ? "" : value,
    }))
  }

  // 필터 초기화
  const handleResetFilters = () => {
    setFilters({})
  }

  // 셀 강조 토글 (원본 rowIndex와 header로 매핑) - useCallback으로 최적화
  const toggleCellHighlight = useCallback((originalIndex: number, header: string) => {
    if (!isHighlightMode) return // 강조 모드가 비활성화되어 있으면 동작하지 않음
    
    const cellKey = `${originalIndex}-${header}`
    setHighlightedCells((prev) => {
      // Set을 복사하지 않고 직접 수정하여 성능 개선
      const newSet = new Set(prev)
      if (newSet.has(cellKey)) {
        newSet.delete(cellKey)
      } else {
        newSet.add(cellKey)
      }
      return newSet
    })
  }, [isHighlightMode])

  // 강조 모드 토글
  const toggleHighlightMode = () => {
    setIsHighlightMode((prev) => !prev)
  }

  // 모든 강조 초기화
  const clearAllHighlights = () => {
    setHighlightedCells(new Set())
  }

  // 드래그 스크롤 핸들러 (성능 최적화: throttle 적용)
  useEffect(() => {
    let lastUpdateTime = 0
    const throttleDelay = 16 // ~60fps
    
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDraggingScroll || !dragStartRef.current || !tableContainerRef.current) return
      
      const now = Date.now()
      if (now - lastUpdateTime < throttleDelay) {
        return
      }
      lastUpdateTime = now
      
      const deltaX = Math.abs(e.pageX - dragStartRef.current.x)
      dragDistanceRef.current = deltaX
      
      // 일정 거리 이상 움직였을 때만 스크롤 (클릭과 드래그 구분)
      if (deltaX > 3) {
        e.preventDefault()
        e.stopPropagation()
        
        // requestAnimationFrame으로 부드러운 스크롤
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current)
        }
        
        rafRef.current = requestAnimationFrame(() => {
          if (tableContainerRef.current && dragStartRef.current) {
            const walk = (e.pageX - dragStartRef.current.x) * 1.5 // 스크롤 속도 조절
            tableContainerRef.current.scrollLeft = dragStartRef.current.scrollLeft - walk
          }
        })
      }
    }

    const handleGlobalMouseUp = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      
      setIsDraggingScroll(false)
      dragStartRef.current = null
      dragDistanceRef.current = 0
    }

    if (isDraggingScroll) {
      document.addEventListener('mousemove', handleGlobalMouseMove, { passive: false })
      document.addEventListener('mouseup', handleGlobalMouseUp)
      
      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove)
        document.removeEventListener('mouseup', handleGlobalMouseUp)
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current)
        }
      }
    }
  }, [isDraggingScroll])

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tableContainerRef.current) return
    
    // Select 컴포넌트나 버튼 클릭은 제외
    const target = e.target as HTMLElement
    if (target.closest('button, [role="combobox"], [role="option"]')) {
      return
    }
    
    setIsDraggingScroll(true)
    dragStartRef.current = {
      x: e.pageX,
      scrollLeft: tableContainerRef.current.scrollLeft,
      startTime: Date.now()
    }
    dragDistanceRef.current = 0
  }

  const handleMouseLeave = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    setIsDraggingScroll(false)
    dragStartRef.current = null
    dragDistanceRef.current = 0
  }

  const handleFileSelectClick = () => {
    fileInputRef.current?.click()
  }

  // 드래그 앤 드롭 핸들러
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      await processFile(files[0])
    }
  }

  return (
    <div className="relative mx-auto max-w-7xl p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Excel Viewer</h1>
        <p className="text-muted-foreground mt-2">엑셀 파일을 업로드하여 데이터를 확인하세요</p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>파일 업로드</CardTitle>
              <CardDescription className="mt-1">엑셀 파일(.xlsx, .csv)을 선택하거나 드래그하여 업로드하세요</CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <Button
                onClick={handleFileSelectClick}
                disabled={isLoading}
                variant="outline"
              >
                파일 선택
              </Button>
              {fileName && (
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground truncate max-w-[200px]" title={fileName}>
                    {fileName}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClear}
                    className="h-8 w-8 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {isLoading && (
                <p className="text-sm text-muted-foreground">파일을 읽는 중...</p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 transition-colors ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            }`}
          >
            <div className="flex flex-col items-center justify-center gap-4">
              <Upload className={`h-12 w-12 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
              <div className="text-center">
                <p className="text-sm font-medium">
                  {isDragging ? "파일을 여기에 놓으세요" : "파일을 드래그하여 업로드하세요"}
                </p>
              </div>
            </div>
          </div>
          <Input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv"
            onChange={handleFileUpload}
            disabled={isLoading}
            className="hidden"
          />
        </CardContent>
      </Card>

      {excelData.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>데이터 뷰</CardTitle>
                <CardDescription>
                  <div>
                    총 {excelData.length}개의 행이 있습니다
                    {filteredAndSortedData.length !== excelData.length && (
                      <span className="ml-2 text-primary">
                        (필터링 결과: {filteredAndSortedData.length}개 행)
                      </span>
                    )}
                    {filteredAndSortedData.length > ITEMS_PER_PAGE && (
                      <span className="ml-2 text-muted-foreground">
                        (페이지 {currentPage}/{totalPages}, {startIndex + 1}-{Math.min(endIndex, filteredAndSortedData.length)}행 표시)
                      </span>
                    )}
                    {excelData.length >= 1000 && " (최대 1000행까지만 표시됩니다)"}
                  </div>
                  {sorts.length === 0 && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      💡 Shift+클릭으로 다중 정렬 가능
                    </div>
                  )}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={isHighlightMode ? "default" : "outline"}
                  size="sm"
                  onClick={toggleHighlightMode}
                  className={isHighlightMode ? "bg-yellow-500 hover:bg-yellow-600 text-white" : ""}
                >
                  강조 모드
                </Button>
                {highlightedCells.size > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearAllHighlights}
                  >
                    강조 초기화 ({highlightedCells.size})
                  </Button>
                )}
                {sorts.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearAllSorts}
                  >
                    정렬 초기화 ({sorts.length})
                  </Button>
                )}
                {Object.keys(filters).some(key => filters[key] !== "") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetFilters}
                  >
                    필터 초기화
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative w-full">
              <div 
                ref={tableContainerRef}
                className={`overflow-x-auto border rounded-md ${isDraggingScroll ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
                style={{ 
                  userSelect: 'none', 
                  WebkitUserSelect: 'none',
                  willChange: isDraggingScroll ? 'scroll-position' : 'auto', // 성능 최적화
                  contain: 'layout style paint', // 렌더링 최적화
                  transform: 'translateZ(0)', // GPU 가속 활성화
                }}
                onMouseDown={handleMouseDown}
                onMouseLeave={handleMouseLeave}
              >
                <div 
                  className="min-w-full inline-block" 
                  style={{ 
                    willChange: isDraggingScroll ? 'transform' : 'auto',
                    transform: 'translateZ(0)', // GPU 가속 활성화
                  }}
                >
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      {/* 헤더 행 */}
                      <TableRow>
                        {headers.map((header, index) => {
                          const sortConfig = sorts.find(s => s.column === header)
                          const sortPriority = sortConfig ? sorts.findIndex(s => s.column === header) + 1 : null
                          
                          return (
                            <TableHead 
                              key={index} 
                              className={`font-semibold min-w-[120px] p-2 text-center ${
                                sortConfig 
                                  ? sortConfig.direction === "asc"
                                    ? 'bg-blue-100 dark:bg-blue-900/30' 
                                    : 'bg-red-100 dark:bg-red-900/30'
                                  : 'bg-muted/50'
                              }`}
                            >
                              <button
                                onClick={(e) => handleSort(header, e)}
                                className={`flex items-center justify-center gap-1.5 hover:text-primary transition-colors w-full group ${
                                  sortConfig ? '' : ''
                                }`}
                                title={sortConfig 
                                  ? `정렬: ${sortConfig.direction === 'asc' ? '오름차순' : '내림차순'} (우선순위 ${sortPriority})${sorts.length > 1 ? '\n클릭: 정렬 변경\nShift+클릭: 다중 정렬 추가' : '\n클릭: 정렬 변경'}`
                                  : '클릭: 오름차순 정렬\nShift+클릭: 다중 정렬 추가'}
                              >
                                <span className="whitespace-nowrap">{header}</span>
                                <div className="flex items-center gap-0.5 shrink-0">
                                  {sortConfig ? (
                                    <>
                                      {sortConfig.direction === "asc" ? (
                                        <ArrowUp className="h-4 w-4 text-blue-600 dark:text-blue-400 font-bold" />
                                      ) : (
                                        <ArrowDown className="h-4 w-4 text-red-600 dark:text-red-400 font-bold" />
                                      )}
                                      {sorts.length > 1 && (
                                        <span className={`text-[10px] font-bold px-1 rounded ${
                                          sortConfig.direction === "asc"
                                            ? 'text-blue-600 dark:text-blue-400 bg-blue-200 dark:bg-blue-800/50'
                                            : 'text-red-600 dark:text-red-400 bg-red-200 dark:bg-red-800/50'
                                        }`}>
                                          {sortPriority}
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <ArrowUpDown className="h-4 w-4 opacity-30 group-hover:opacity-60 transition-opacity" />
                                  )}
                                </div>
                              </button>
                            </TableHead>
                          )
                        })}
                      </TableRow>
                      {/* 필터 행 - 헤더와 함께 sticky로 고정 */}
                      <TableRow className="bg-muted/20">
                        {headers.map((header, colIndex) => (
                          <TableHead 
                            key={`filter-${colIndex}`} 
                            className="min-w-[120px] p-2 text-center bg-muted/20"
                          >
                            <Select
                              value={filters[header] || "all"}
                              onValueChange={(value) => handleFilterChange(header, value)}
                            >
                              <SelectTrigger className="h-8 text-xs w-full justify-center">
                                <SelectValue placeholder="전체" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">전체</SelectItem>
                                {columnUniqueValues[header]?.map((value, idx) => (
                                  <SelectItem key={idx} value={value}>
                                    {value}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* 데이터 행들 */}
                      {filteredAndSortedData.length === 0 ? (
                        <TableRow>
                          <TableCell 
                            colSpan={headers.length} 
                            className="text-center text-muted-foreground py-8"
                          >
                            필터 조건에 맞는 데이터가 없습니다.
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedData.map((row, rowIndex) => {
                          const originalIndex = row.__originalIndex
                          return (
                            <TableRow key={rowIndex}>
                              {headers.map((header, colIndex) => {
                                const cellValue = String(row[header] || "")
                                const cellKey = `${originalIndex}-${header}`
                                const isHighlighted = highlightedCells.has(cellKey)
                                
                                // className을 미리 계산하여 성능 개선
                                const cellClassName = `min-w-[120px] max-w-[300px] p-2 text-center transition-colors select-none user-select-none ${
                                  isHighlighted ? "bg-yellow-200 dark:bg-yellow-900/30" : ""
                                } ${isHighlightMode ? "cursor-pointer hover:bg-muted/50" : ""}`
                                
                                return (
                                  <TableCell 
                                    key={colIndex} 
                                    className={cellClassName}
                                    style={{ 
                                      userSelect: 'none', 
                                      WebkitUserSelect: 'none', 
                                      MozUserSelect: 'none',
                                      willChange: isDraggingScroll ? 'auto' : 'auto' // 성능 최적화
                                    }}
                                    title={cellValue}
                                    onMouseDown={(e) => {
                                      // 드래그 스크롤 중이면 클릭 이벤트 방지
                                      if (isDraggingScroll) {
                                        e.preventDefault()
                                        e.stopPropagation()
                                      }
                                    }}
                                    onClick={(e) => {
                                      // 드래그 거리가 짧을 때만 강조 처리
                                      if (dragDistanceRef.current <= 3 && !isDraggingScroll && isHighlightMode) {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        toggleCellHighlight(originalIndex, header)
                                      }
                                    }}
                                  >
                                    <div className="wrap-break-word overflow-hidden">
                                      {row[header] !== null && row[header] !== undefined
                                        ? cellValue
                                        : ""}
                                    </div>
                                  </TableCell>
                                )
                              })}
                            </TableRow>
                          )
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
              {/* 페이지네이션 */}
              {filteredAndSortedData.length > ITEMS_PER_PAGE && (
                <div className="mt-4">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            if (currentPage > 1) {
                              setCurrentPage((prev) => prev - 1)
                            }
                          }}
                          className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer select-none"}
                          style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                        />
                      </PaginationItem>
                      {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
                        let pageNum: number
                        if (totalPages <= 10) {
                          pageNum = i + 1
                        } else if (currentPage <= 5) {
                          pageNum = i + 1
                        } else if (currentPage >= totalPages - 4) {
                          pageNum = totalPages - 9 + i
                        } else {
                          pageNum = currentPage - 5 + i
                        }
                        return (
                          <PaginationItem key={pageNum}>
                            <PaginationLink
                              isActive={currentPage === pageNum}
                              href="#"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setCurrentPage(pageNum)
                              }}
                              className="cursor-pointer select-none"
                              style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                            >
                              {pageNum}
                            </PaginationLink>
                          </PaginationItem>
                        )
                      })}
                      {totalPages > 10 && currentPage < totalPages - 4 && (
                        <PaginationItem>
                          <PaginationEllipsis />
                        </PaginationItem>
                      )}
                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            if (currentPage < totalPages) {
                              setCurrentPage((prev) => prev + 1)
                            }
                          }}
                          className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer select-none"}
                          style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  )
}
