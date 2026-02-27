import { type NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db/mysql"
import { verifyToken } from "@/lib/auth"

// POST /api/reports/bulk - 엑셀에서 일괄 의료 리포트 저장
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const decoded = verifyToken(token)
    if (!decoded) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    if (decoded.role !== "staff") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { form_data, row_index } = body

    if (!form_data || typeof form_data !== "object") {
      return NextResponse.json({ error: "form_data is required" }, { status: 400 })
    }

    // reports 테이블이 있는지 확인
    const tableRows = await query(
      `SELECT COUNT(*) as cnt
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'reports'`
    )
    const hasReportsTable = Number((tableRows as any)?.[0]?.cnt || 0) > 0

    if (!hasReportsTable) {
      // reports 테이블 생성
      await query(`
        CREATE TABLE IF NOT EXISTS reports (
          id VARCHAR(36) PRIMARY KEY,
          task_id VARCHAR(36) NULL,
          case_id VARCHAR(36) NULL,
          form_data JSON NOT NULL,
          report_html TEXT NULL,
          staff_comments TEXT NULL,
          client_comments TEXT NULL,
          report_file_url VARCHAR(512) NULL,
          uploaded_by VARCHAR(36) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_task_id (task_id),
          INDEX idx_case_id (case_id),
          INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `)
    }

    // UUID 생성
    const reportId = require("crypto").randomUUID()

    // form_data를 JSON으로 저장
    const formDataJson = JSON.stringify(form_data)

    // reports 테이블에 삽입
    await query(
      `INSERT INTO reports (
        id,
        form_data,
        uploaded_by,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, NOW(), NOW())`,
      [reportId, formDataJson, decoded.id]
    )

    return NextResponse.json({
      success: true,
      report_id: reportId,
      row_index,
    })
  } catch (error) {
    console.error("[Bulk Report Save] Error:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
