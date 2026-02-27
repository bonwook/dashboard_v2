import { type NextRequest, NextResponse } from "next/server"
import { query, queryOne } from "@/lib/db/mysql"
import { verifyToken } from "@/lib/auth"
import { randomUUID } from "crypto"

function hasReportInfoTable(): Promise<boolean> {
  return query<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_info'`
  ).then((rows) => Number(rows?.[0]?.cnt || 0) > 0)
}

/** GET: 단건(task_id) 또는 목록(aggregation용, 쿼리 필터 지원) */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const decoded = verifyToken(token)
    if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    if (decoded.role !== "staff") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const exists = await hasReportInfoTable()
    if (!exists) {
      return NextResponse.json({ rows: [], columns: [] })
    }

    const { searchParams } = new URL(request.url)
    const taskId = searchParams.get("task_id")

    if (taskId) {
      const row = await queryOne<any>(
        `SELECT id, task_id, case_id, form_data, uploaded_by, created_at, updated_at
         FROM report_info WHERE task_id = ?`,
        [taskId]
      )
      if (!row) return NextResponse.json({ row: null })
      const formData = typeof row.form_data === "string" ? JSON.parse(row.form_data || "{}") : (row.form_data || {})
      return NextResponse.json({ row: { ...row, form_data: formData } })
    }

    // 목록: aggregation용 (필터는 클라이언트 또는 쿼리 파라미터로)
    const caseId = searchParams.get("case_id") ?? null
    let sql = `
      SELECT ri.id, ri.task_id, ri.case_id, ri.form_data, ri.uploaded_by, ri.created_at, ri.updated_at,
             ta.title as task_title, ta.completed_at
      FROM report_info ri
      LEFT JOIN task_assignments ta ON ta.id = ri.task_id
      WHERE 1=1
    `
    const params: (string | null)[] = []
    if (caseId) {
      sql += ` AND ri.case_id = ?`
      params.push(caseId)
    }
    sql += ` ORDER BY ri.updated_at DESC`

    const rows = await query<any>(sql, params)
    
    // reports 테이블에서 bulk 저장된 데이터도 가져오기 (테이블과 필수 컬럼 확인)
    let bulkReports: any[] = []
    try {
      const hasReportsTable = await query<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports'`
      ).then((rows) => Number(rows?.[0]?.cnt || 0) > 0)
      
      if (hasReportsTable) {
        // 필수 컬럼들이 모두 있는지 확인
        const columns = await query<{ COLUMN_NAME: string }>(
          `SELECT COLUMN_NAME FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports'`
        )
        
        const columnNames = new Set(columns.map((c: any) => c.COLUMN_NAME))
        
        // form_data 컬럼이 있어야만 조회 (없으면 스킵)
        if (columnNames.has('form_data')) {
          const hasTaskId = columnNames.has('task_id')
          const hasCaseId = columnNames.has('case_id')
          const hasUploadedBy = columnNames.has('uploaded_by')
          
          const taskIdField = hasTaskId ? 'task_id' : 'NULL as task_id'
          const caseIdField = hasCaseId ? 'case_id' : 'NULL as case_id'
          const uploadedByField = hasUploadedBy ? 'uploaded_by' : 'NULL as uploaded_by'
          
          bulkReports = await query<any>(
            `SELECT id, ${taskIdField}, ${caseIdField}, form_data, ${uploadedByField}, created_at, updated_at
             FROM reports
             ORDER BY updated_at DESC`
          )
        }
      }
    } catch (error) {
      console.error('[reports/info] Error loading bulk reports:', error)
      // 오류가 발생해도 report_info 데이터는 반환
    }
    
    // 두 테이블의 데이터를 합치기
    const allRows = [...rows, ...bulkReports]
    
    const normalized = (allRows || []).map((r: any) => {
      const formData = typeof r.form_data === "string" ? JSON.parse(r.form_data || "{}") : (r.form_data || {})
      return { 
        ...r, 
        form_data: formData,
        task_title: r.task_title || "엑셀 업로드",
        task_id: r.task_id || r.id,
        case_id: r.case_id || r.id
      }
    })
    
    return NextResponse.json({ rows: normalized })
  } catch (e) {
    console.error("[reports/info] GET error:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/** POST: upsert by task_id (같은 태스크면 업데이트, 없으면 삽입) */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const decoded = verifyToken(token)
    if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    if (decoded.role !== "staff") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const exists = await hasReportInfoTable()
    if (!exists) {
      return NextResponse.json({ error: "report_info table not found" }, { status: 503 })
    }

    const body = await request.json()
    const taskId = body.task_id as string
    let caseId = (body.case_id as string) || taskId
    const formData = body.form_data as Record<string, string | number | undefined> | null

    if (!taskId) {
      return NextResponse.json({ error: "task_id is required" }, { status: 400 })
    }

    const jsonStr = formData ? JSON.stringify(formData) : null
    const existing = await queryOne<any>(`SELECT id FROM report_info WHERE task_id = ?`, [taskId])

    if (existing) {
      await query(
        `UPDATE report_info SET case_id = ?, form_data = ?, uploaded_by = ?, updated_at = NOW() WHERE task_id = ?`,
        [caseId, jsonStr, decoded.id, taskId]
      )
    } else {
      await query(
        `INSERT INTO report_info (id, task_id, case_id, form_data, uploaded_by) VALUES (?, ?, ?, ?, ?)`,
        [randomUUID(), taskId, caseId, jsonStr, decoded.id]
      )
    }

    return NextResponse.json({ success: true, task_id: taskId })
  } catch (e) {
    console.error("[reports/info] POST error:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
