import { NextRequest, NextResponse } from "next/server"
import ExcelJS from "exceljs"
import iconv from "iconv-lite"
import type { ExcelData, ParseResponse } from "@/lib/types"

// 최대 처리 행 수 제한 (성능 최적화)
const MAX_ROWS = 1000

// Excel 셀 값을 안전하게 문자열로 변환하는 헬퍼 함수
function getCellValueAsString(cell: ExcelJS.Cell): string {
  try {
    const value = cell.value
    
    if (value === null || value === undefined) {
      return ""
    }
    
    // ExcelJS의 text 속성을 우선 사용 (Rich Text, 공식 등 자동 처리)
    // 단, text가 있더라도 value가 더 정확할 수 있으므로 value를 우선 처리
    if (cell.text !== undefined && cell.text !== null && typeof value === "string") {
      // value가 이미 문자열이면 그대로 사용
      return value
    }

    // Rich Text 처리 (ExcelJS의 RichText 형식)
    if (typeof value === "object") {
      // RichText 객체인 경우
      if ("richText" in value && Array.isArray(value.richText)) {
        return value.richText
          .map((rt: any) => {
            if (typeof rt === "string") return rt
            if (rt && typeof rt === "object" && "text" in rt) {
              return String(rt.text)
            }
            return ""
          })
          .join("")
      }
      
      // text 속성이 있는 경우
      if ("text" in value) {
        return String(value.text)
      }
      
      // Formula result 처리
      if ("result" in value) {
        const result = value.result
        if (result === null || result === undefined) {
          return ""
        }
        // RichText가 포함된 경우 직접 처리
        if (typeof result === "object" && "richText" in result && Array.isArray(result.richText)) {
          return result.richText
            .map((rt: any) => {
              if (typeof rt === "string") return rt
              if (rt && typeof rt === "object" && "text" in rt) {
                return String(rt.text)
              }
              return ""
            })
            .join("")
        }
        return String(result)
      }
      
      // Date 객체 처리
      if (value instanceof Date) {
        return value.toLocaleString("ko-KR")
      }
      
      // 기타 객체는 문자열로 변환 시도
      return String(value)
    }

    // 기본 타입은 문자열로 변환
    return String(value)
  } catch (error) {
    console.error("셀 값 변환 오류:", error)
    return ""
  }
}

// CSV 파일 파싱 (iconv-lite로 CP949 처리)
function parseCSV(buffer: Buffer, encoding: string = "utf8"): string {
  try {
    // 인코딩 감지 및 변환
    if (encoding === "cp949" || encoding === "euc-kr") {
      return iconv.decode(buffer, "cp949")
    }
    return buffer.toString("utf8")
  } catch (error) {
    // UTF-8로 fallback
    return buffer.toString("utf8")
  }
}

// CSV 라인 파싱 (쉼표로 구분, 따옴표 처리)
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // 이스케이프된 따옴표
        current += '"'
        i++
      } else {
        // 따옴표 시작/끝
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      // 쉼표로 구분
      result.push(current.trim())
      current = ""
    } else {
      current += char
    }
  }
  
  // 마지막 필드 추가
  result.push(current.trim())
  
  return result
}

// CSV 파일 처리
async function processCSVFile(buffer: Buffer, fileName: string): Promise<ParseResponse> {
  try {
    // 여러 인코딩 시도 (CP949 우선 - 한국어 파일)
    let text: string | null = null
    let bestText: string | null = null
    let bestScore = -1
    const encodings = ["cp949", "euc-kr", "utf8"]
    
    for (const enc of encodings) {
      try {
        const decoded = parseCSV(buffer, enc)
        
        // 한글, 일본어, 중국어 등 다양한 문자를 포함하는지 확인
        const koreanCount = (decoded.match(/[가-힣]/g) || []).length
        const chineseCount = (decoded.match(/[一-龯]/g) || []).length
        const japaneseCount = (decoded.match(/[\u3040-\u309F\u30A0-\u30FF]/g) || []).length
        const nonAsciiCount = (decoded.match(/[^\x00-\x7F]/g) || []).length
        
        // 점수 계산 (한글이 있으면 높은 점수)
        const score = koreanCount * 10 + chineseCount * 5 + japaneseCount * 5 + nonAsciiCount
        
        // 한글이 있는 경우 우선 선택
        if (koreanCount > 0 && score > bestScore) {
          bestScore = score
          bestText = decoded
          // 한글이 많이 있으면 바로 선택
          if (koreanCount > 10) {
            text = decoded
            break
          }
        } else if (score > bestScore) {
          bestScore = score
          bestText = decoded
        }
      } catch (err) {
        continue
      }
    }
    
    // 최적의 인코딩 결과 사용
    if (!text && bestText) {
      text = bestText
    }
    
    // 모든 인코딩 실패 시 UTF-8로 fallback
    if (!text) {
      text = buffer.toString("utf8")
    }

    const lines = text.split(/\r?\n/).filter(line => line.trim() !== "")
    
    if (lines.length === 0) {
      return {
        headers: [],
        data: [],
        error: "CSV 파일에 데이터가 없습니다."
      }
    }

    // 헤더 찾기: 첫 줄부터 최대 50줄까지 검색
    let headerRowIndex = 0
    let extractedHeaders: string[] = []
    const MAX_SEARCH_ROWS = 50
    
    for (let i = 0; i < Math.min(MAX_SEARCH_ROWS, lines.length); i++) {
      const parsedLine = parseCSVLine(lines[i])
      // 빈 셀이 아닌 헤더가 있는지 확인
      const validHeaders = parsedLine.filter(h => h && h.trim() !== "")
      
      if (validHeaders.length > 0) {
        // 앞쪽 빈 셀 제거 (데이터가 시작하는 첫 컬럼부터)
        let firstDataCol = 0
        for (let j = 0; j < parsedLine.length; j++) {
          if (parsedLine[j] && parsedLine[j].trim() !== "") {
            firstDataCol = j
            break
          }
        }
        // 뒤쪽 빈 셀 제거
        let lastDataCol = parsedLine.length
        for (let j = parsedLine.length - 1; j >= 0; j--) {
          if (parsedLine[j] && parsedLine[j].trim() !== "") {
            lastDataCol = j + 1
            break
          }
        }
        extractedHeaders = parsedLine.slice(firstDataCol, lastDataCol)
        headerRowIndex = i
        break
      }
    }

    // 헤더를 찾지 못한 경우 열 번호로 헤더 생성
    if (extractedHeaders.length === 0) {
      // 첫 번째 줄의 열 개수를 확인하여 헤더 생성
      if (lines.length > 0) {
        const firstLineCols = parseCSVLine(lines[0])
        const maxCols = Math.min(50, firstLineCols.length || 50)
        extractedHeaders = Array.from({ length: maxCols }, (_, i) => `Column ${i + 1}`)
      } else {
        extractedHeaders = Array.from({ length: 50 }, (_, i) => `Column ${i + 1}`)
      }
      headerRowIndex = 0
    }

    // 데이터 행 파싱 (헤더 행 이후부터)
    const jsonData: ExcelData[] = []
    
    // 헤더 행에서 첫 데이터 컬럼 위치 찾기
    let firstDataCol = 0
    if (headerRowIndex >= 0 && lines[headerRowIndex]) {
      const headerLine = parseCSVLine(lines[headerRowIndex])
      for (let j = 0; j < headerLine.length; j++) {
        if (headerLine[j] && headerLine[j].trim() !== "") {
          firstDataCol = j
          break
        }
      }
    }
    
    for (let i = headerRowIndex + 1; i < lines.length && jsonData.length < MAX_ROWS; i++) {
      const rowValues = parseCSVLine(lines[i])
      const rowData: ExcelData = {}
      
      // 첫 데이터 컬럼부터 추출
      extractedHeaders.forEach((header, index) => {
        const sourceIndex = firstDataCol + index
        rowData[header] = rowValues[sourceIndex] !== undefined ? String(rowValues[sourceIndex]) : ""
      })
      
      // 빈 행이 아닌 경우만 추가
      if (Object.values(rowData).some((val) => val !== "" && val !== null && val !== undefined)) {
        jsonData.push(rowData)
      }
    }

    return {
      headers: extractedHeaders,
      data: jsonData
    }
  } catch (error) {
    console.error("CSV 처리 오류:", error)
    return {
      headers: [],
      data: [],
      error: "CSV 파일 처리 중 오류가 발생했습니다: " + (error instanceof Error ? error.message : String(error))
    }
  }
}

// Excel 워크북 처리
async function processWorkbook(workbook: ExcelJS.Workbook): Promise<ParseResponse> {
  try {
    // Get first worksheet
    const worksheet = workbook.worksheets[0]
    
    if (!worksheet) {
      return {
        headers: [],
        data: [],
        error: "엑셀 파일에 시트가 없습니다."
      }
    }

    // 헤더 찾기: 첫 행부터 최대 50행까지 검색
    let headerRowIndex = 0
    let extractedHeaders: string[] = []
    let firstDataCol = 1 // 첫 데이터 컬럼 위치 (1부터 시작)
    const MAX_SEARCH_ROWS = 50
    const MAX_SEARCH_COLS = 50
    
    // 첫 행부터 데이터가 있는 행 찾기
    for (let rowNum = 1; rowNum <= MAX_SEARCH_ROWS; rowNum++) {
      const row = worksheet.getRow(rowNum)
      if (!row) continue
      
      const tempHeaders: string[] = []
      let hasData = false
      let lastDataCol = 0
      let tempFirstDataCol = 0
      
      // 각 행의 모든 셀 확인 (최대 50열까지, 직접 접근)
      for (let colNum = 1; colNum <= MAX_SEARCH_COLS; colNum++) {
        try {
          const cell = row.getCell(colNum)
          const headerValue = getCellValueAsString(cell)
          
          if (headerValue && headerValue.trim() !== "") {
            tempHeaders.push(headerValue.trim())
            hasData = true
            lastDataCol = colNum
            if (tempFirstDataCol === 0) {
              tempFirstDataCol = colNum
            }
          } else {
            tempHeaders.push("")
          }
        } catch (error) {
          // 셀이 존재하지 않으면 빈 문자열 추가
          tempHeaders.push("")
        }
      }
      
      // 헤더로 사용할 수 있는 행 찾기 (최소 1개 이상의 셀에 데이터가 있어야 함)
      if (hasData) {
        // 앞쪽 빈 셀 제거 (데이터가 시작하는 첫 컬럼부터)
        let firstDataColIndex = 0
        for (let i = 0; i < tempHeaders.length; i++) {
          if (tempHeaders[i] && tempHeaders[i].trim() !== "") {
            firstDataColIndex = i
            break
          }
        }
        // 뒤쪽 빈 셀 제거
        extractedHeaders = tempHeaders.slice(firstDataColIndex, lastDataCol)
        firstDataCol = tempFirstDataCol
        headerRowIndex = rowNum
        break
      }
    }

    // 헤더를 찾지 못한 경우: 실제 데이터 행에서 열 개수 확인 후 열 번호로 헤더 생성
    if (extractedHeaders.length === 0) {
      let maxColumnCount = 0
      let foundFirstCol = false
      // 데이터 행에서 최대 열 개수 및 첫 데이터 컬럼 찾기
      for (let rowNum = 1; rowNum <= Math.min(MAX_SEARCH_ROWS, 10); rowNum++) {
        const row = worksheet.getRow(rowNum)
        if (row) {
          for (let colNum = 1; colNum <= MAX_SEARCH_COLS; colNum++) {
            try {
              const cell = row.getCell(colNum)
              const value = getCellValueAsString(cell)
              if (value && value.trim() !== "") {
                maxColumnCount = Math.max(maxColumnCount, colNum)
                if (!foundFirstCol) {
                  firstDataCol = colNum
                  foundFirstCol = true
                }
              }
            } catch (error) {
              // 셀이 없으면 무시
            }
          }
        }
      }
      
      // 최소 1개 열은 있어야 함
      if (maxColumnCount === 0) {
        maxColumnCount = MAX_SEARCH_COLS
        firstDataCol = 1
      } else if (!foundFirstCol) {
        firstDataCol = 1
      }
      
      extractedHeaders = Array.from({ length: maxColumnCount - firstDataCol + 1 }, (_, i) => `Column ${i + 1}`)
      headerRowIndex = 1
    }

    // Extract data rows (헤더 행 이후부터)
    const jsonData: ExcelData[] = []
    let rowCount = 0
    
    worksheet.eachRow((row, rowNumber) => {
      // Skip header row
      if (rowNumber <= headerRowIndex) return

      // 최대 행 수 제한
      if (rowCount >= MAX_ROWS) {
        return
      }

      const rowData: ExcelData = {}
      // 헤더 개수만큼만 데이터 추출 (첫 데이터 컬럼부터)
      for (let i = 0; i < extractedHeaders.length; i++) {
        const colNum = firstDataCol + i
        try {
          const cell = row.getCell(colNum)
          const header = extractedHeaders[i]
          rowData[header] = getCellValueAsString(cell)
        } catch (error) {
          // 셀이 없으면 빈 문자열
          const header = extractedHeaders[i]
          rowData[header] = ""
        }
      }
      
      // Only add row if it has at least one non-empty value
      if (Object.values(rowData).some((val) => val !== "" && val !== null && val !== undefined)) {
        jsonData.push(rowData)
        rowCount++
      }
    })

    return {
      headers: extractedHeaders,
      data: jsonData
    }
  } catch (error) {
    console.error("워크북 처리 오류:", error)
    return {
      headers: [],
      data: [],
      error: "데이터 처리 중 오류가 발생했습니다: " + (error instanceof Error ? error.message : String(error))
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json(
        { error: "파일이 제공되지 않았습니다." },
        { status: 400 }
      )
    }

    // 파일 확장자 확인
    const validExtensions = [".xlsx", ".csv"]
    const fileExtension = "." + file.name.split(".").pop()?.toLowerCase()
    
    if (!validExtensions.includes(fileExtension)) {
      return NextResponse.json(
        { error: "엑셀 파일(.xlsx, .csv)만 업로드 가능합니다." },
        { status: 400 }
      )
    }

    // 파일 크기 제한 (50MB)
    const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `파일 크기가 너무 큽니다. 최대 ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB까지 업로드 가능합니다.` },
        { status: 400 }
      )
    }

    // 파일을 ArrayBuffer로 읽기
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    let result: ParseResponse

    if (fileExtension === ".csv") {
      // CSV 파일 처리
      result = await processCSVFile(buffer, file.name)
    } else {
      // Excel 파일 처리
      const workbook = new ExcelJS.Workbook()
      // ExcelJS는 기본적으로 UTF-8을 지원하므로 추가 설정 불필요
      // ExcelJS의 load는 Buffer, Stream, ArrayBuffer 등을 받을 수 있음
      await workbook.xlsx.load(arrayBuffer)
      result = await processWorkbook(workbook)
      // 워크북은 함수 스코프를 벗어나면 자동으로 가비지 컬렉션됨
    }
    
    // 버퍼와 arrayBuffer는 함수 스코프를 벗어나면 자동으로 가비지 컬렉션됨
    // 명시적으로 null로 설정하여 GC 힌트 제공
    // (실제로는 스코프를 벗어나면 자동 정리되지만, 메모리 관리 강화)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { 
          status: 400,
          headers: {
            "Content-Type": "application/json; charset=utf-8"
          }
        }
      )
    }

    // JSON 응답에 UTF-8 인코딩 명시
    return NextResponse.json(
      {
        headers: result.headers,
        data: result.data
      },
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        }
      }
    )
  } catch (error) {
    console.error("Excel 파싱 API 오류:", error)
    return NextResponse.json(
      { error: "파일 처리 중 오류가 발생했습니다: " + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    )
  }
}

