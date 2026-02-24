import type { ImportedData } from "../types"

/** CSV 한 줄 파싱 (쉼표, 따옴표 처리) */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim())
      current = ""
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

/** 클라이언트에서 CSV 파일 파싱 */
export function parseCSVFile(file: File): Promise<ImportedData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = (reader.result as string) || ""
        const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
        if (lines.length === 0) {
          resolve({ fileName: file.name, headers: [], rows: [] })
          return
        }
        const headers = parseCSVLine(lines[0])
        const rows = lines.slice(1).map((line) => parseCSVLine(line))
        resolve({ fileName: file.name, headers, rows })
      } catch (e) {
        reject(e)
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file, "UTF-8")
  })
}

/** Excel 파일 파싱: 기존 /api/excel/parse 사용 후 ImportedData 형태로 변환 */
export async function parseExcelFile(file: File): Promise<ImportedData> {
  const formData = new FormData()
  formData.append("file", file)
  const res = await fetch("/api/excel/parse", {
    method: "POST",
    credentials: "include",
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || "Excel 파싱 실패")
  }
  const json = await res.json()
  const headers: string[] = json.headers || []
  const data: Record<string, unknown>[] = json.data || []
  const rows = data.map((row) =>
    headers.map((h: string) => String(row[h] ?? ""))
  )
  return { fileName: file.name, headers, rows }
}

/** 파일 확장자로 CSV/Excel 구분 후 파싱 */
export async function parseFile(file: File): Promise<ImportedData> {
  const name = file.name.toLowerCase()
  if (name.endsWith(".csv")) {
    return parseCSVFile(file)
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return parseExcelFile(file)
  }
  throw new Error("CSV(.csv) 또는 Excel(.xlsx, .xls) 파일만 지원합니다.")
}
