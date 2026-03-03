import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { saveFileData } from "@/lib/database/spreadsheet"
import ExcelJS from "exceljs"

function cellToString(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v === null || v === undefined) return ""
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray(v.richText)) {
      return v.richText.map((rt: any) => rt?.text ?? "").join("")
    }
    if ("result" in v) return String(v.result ?? "")
    if ("text" in v) return String(v.text)
    if (v instanceof Date) return v.toLocaleDateString("ko-KR")
  }
  return String(v)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const decoded = verifyToken(token)
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

  try {
    const { id } = await params
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 })

    const arrayBuffer = await file.arrayBuffer()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(arrayBuffer)

    const sheet = workbook.worksheets[0]
    if (!sheet) return NextResponse.json({ error: "빈 파일입니다." }, { status: 400 })

    // Find header row (first row with data)
    let headerRowNum = 0
    let headers: string[] = []
    let firstDataCol = 1

    for (let r = 1; r <= Math.min(50, sheet.rowCount); r++) {
      const row = sheet.getRow(r)
      const vals: string[] = []
      let firstCol = 0
      for (let c = 1; c <= 50; c++) {
        const v = cellToString(row.getCell(c))
        if (v && !firstCol) firstCol = c
        vals.push(v)
      }
      const nonEmpty = vals.filter(Boolean)
      if (nonEmpty.length > 0) {
        const lastDataCol = vals.reduce((acc, v, i) => (v ? i + 1 : acc), 0)
        headers = vals.slice((firstCol || 1) - 1, lastDataCol).map((h, i) => h || `Column ${i + 1}`)
        firstDataCol = firstCol || 1
        headerRowNum = r
        break
      }
    }

    if (headers.length === 0) {
      return NextResponse.json({ error: "헤더를 찾을 수 없습니다." }, { status: 400 })
    }

    const rows: Record<string, string>[] = []
    sheet.eachRow((row, rowNum) => {
      if (rowNum <= headerRowNum) return
      const rowData: Record<string, string> = {}
      headers.forEach((h, i) => {
        rowData[h] = cellToString(row.getCell(firstDataCol + i))
      })
      if (Object.values(rowData).some(Boolean)) rows.push(rowData)
    })

    await saveFileData(id, headers, rows)
    return NextResponse.json({ headers, rows })
  } catch (err) {
    console.error("[spreadsheet/files/[id]/import] POST error:", err)
    return NextResponse.json({ error: "파일 처리 중 오류가 발생했습니다." }, { status: 500 })
  }
}
