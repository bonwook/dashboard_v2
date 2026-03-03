import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { getFileData } from "@/lib/database/spreadsheet"
import ExcelJS from "exceljs"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const decoded = verifyToken(token)
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

  try {
    const { id } = await params
    const { file, rows } = await getFileData(id)
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet("Sheet1")

    if (file.headers.length > 0) {
      const headerRow = sheet.addRow(file.headers)
      headerRow.font = { bold: true }
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE2E8F0" },
      }
    }

    rows.forEach((row) => {
      sheet.addRow(file.headers.map((h) => row[h] ?? ""))
    })

    file.headers.forEach((_, i) => {
      sheet.getColumn(i + 1).width = 18
    })

    const buffer = await workbook.xlsx.writeBuffer()
    const fileName = encodeURIComponent(`${file.name}.xlsx`)

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${fileName}`,
      },
    })
  } catch (err) {
    console.error("[spreadsheet/files/[id]/export] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
