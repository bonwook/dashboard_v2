import { NextRequest, NextResponse } from "next/server"
import ExcelJS from "exceljs"

/** POST: { headers: string[], rows: string[][] } → xlsx 파일 스트림 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const headers = Array.isArray(body.headers) ? body.headers as string[] : []
    const rows = Array.isArray(body.rows) ? body.rows as string[][] : []

    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet("Report", { views: [{ state: "frozen", ySplit: 1 }] })

    if (headers.length > 0) {
      sheet.addRow(headers)
      const headerRow = sheet.getRow(1)
      headerRow.font = { bold: true }
    }
    if (rows.length > 0) {
      for (const row of rows) {
        const padded = [...row]
        while (padded.length < headers.length) padded.push("")
        sheet.addRow(padded.slice(0, headers.length))
      }
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const filename = `medical_report_${new Date().toISOString().slice(0, 10)}.xlsx`

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error("Reports export error:", error)
    return NextResponse.json(
      { error: "Export failed: " + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    )
  }
}
