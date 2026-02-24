/** CSV 문자열 생성 (쉼표, 따옴표 이스케이프) */
function escapeCSVCell(val: string): string {
  const s = String(val ?? "")
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/** 헤더와 행으로 CSV 문자열 생성 */
export function buildCSVString(headers: string[], rows: string[][]): string {
  const headerLine = headers.map(escapeCSVCell).join(",")
  const dataLines = rows.map((row) => row.map(escapeCSVCell).join(","))
  return [headerLine, ...dataLines].join("\r\n")
}

/** CSV 다운로드 트리거 */
export function downloadCSV(headers: string[], rows: string[][], filename: string) {
  const csv = buildCSVString(headers, rows)
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
