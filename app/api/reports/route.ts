import { type NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db/mysql"
import { verifyToken } from "@/lib/auth"
import { uploadToS3 } from "@/lib/aws/s3"
import { randomUUID } from "crypto"

// GET /api/reports - 리포트 목록 조회
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const decoded = verifyToken(token)
    if (!decoded) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }
    const userRole = decoded.role

    const escapeHtml = (input: unknown) => {
      const s = String(input ?? "")
      return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
    }

    const snapshotToHtml = (snapshot: any) => {
      try {
        const title = escapeHtml(snapshot?.title || "Report")
        const content = snapshot?.content ? String(snapshot.content) : ""
        const description = snapshot?.description ? String(snapshot.description) : ""
        const comment = snapshot?.comment ? String(snapshot.comment) : ""
        const files: string[] = Array.isArray(snapshot?.file_keys) ? snapshot.file_keys : []

        return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; line-height:1.6; padding:24px;">
<h1 style="margin:0 0 12px 0;">${title}</h1>
${description ? `<h3>설명</h3><div style="white-space:pre-wrap;">${escapeHtml(description)}</div>` : ""}
${content ? `<h3>내용</h3><div style="white-space:pre-wrap;">${escapeHtml(content)}</div>` : ""}
${comment ? `<h3>코멘트</h3><div style="white-space:pre-wrap;">${escapeHtml(comment)}</div>` : ""}
${files.length ? `<h3>첨부파일</h3><ul>${files.map((k) => `<li>${escapeHtml(k)}</li>`).join("")}</ul>` : ""}
</body></html>`
      } catch {
        return ""
      }
    }

    // Reports는 완료된 작업들을 표시
    // reports 테이블이 있으면 JOIN해서 task_snapshot을 함께 가져옴
    const tableRows = await query(
      `SELECT COUNT(*) as cnt
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'reports'`
    )
    const hasReportsTable = Number((tableRows as any)?.[0]?.cnt || 0) > 0
    const hasTaskSnapshotCol = hasReportsTable
      ? Number((await query(
          `SELECT COUNT(*) as cnt
           FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = 'reports'
             AND COLUMN_NAME = 'task_snapshot'`
        ) as any)?.[0]?.cnt || 0) > 0
      : false

    let reports
    if (userRole === "admin" || userRole === "staff") {
      // Admin/Staff는 모든 완료된 작업 조회
      reports = await query(
        hasReportsTable
          ? `
          SELECT 
            ta.id,
            r.id as report_id,
            ta.title as patient_name,
            ta.priority as priority,
            r.report_html as report_html,
            ${hasTaskSnapshotCol ? "r.task_snapshot as task_snapshot," : "NULL as task_snapshot,"}
            r.staff_comments as staff_comments,
            r.client_comments as client_comments,
            r.report_file_url as report_file_url,
            r.uploaded_by as uploaded_by,
            r.created_at as report_created_at,
            ta.created_at,
            ta.completed_at,
            ta.assigned_by,
            ta.assigned_to,
            p_assigned_by.full_name as assigned_by_name,
            p_assigned_to.full_name as assigned_to_name
          FROM task_assignments ta
          LEFT JOIN reports r ON r.case_id = ta.id
          LEFT JOIN profiles p_assigned_by ON ta.assigned_by = p_assigned_by.id
          LEFT JOIN profiles p_assigned_to ON ta.assigned_to = p_assigned_to.id
          WHERE ta.status = 'completed'
          ORDER BY ta.completed_at DESC
        `
          : `
          SELECT 
            ta.id,
            ta.id as report_id,
            ta.title as patient_name,
            ta.priority as priority,
            NULL as report_html,
            NULL as staff_comments,
            NULL as client_comments,
            NULL as report_file_url,
            NULL as uploaded_by,
            NULL as report_created_at,
            ta.created_at,
            ta.completed_at,
            ta.assigned_by,
            ta.assigned_to,
            p_assigned_by.full_name as assigned_by_name,
            p_assigned_to.full_name as assigned_to_name
          FROM task_assignments ta
          LEFT JOIN profiles p_assigned_by ON ta.assigned_by = p_assigned_by.id
          LEFT JOIN profiles p_assigned_to ON ta.assigned_to = p_assigned_to.id
          WHERE ta.status = 'completed'
          ORDER BY ta.completed_at DESC
        `
      )
    } else {
      // Client는 자신이 지정받았거나 등록한 완료된 작업만 조회
      reports = await query(
        hasReportsTable
          ? `
          SELECT 
            ta.id,
            r.id as report_id,
            ta.title as patient_name,
            ta.priority as priority,
            r.report_html as report_html,
            ${hasTaskSnapshotCol ? "r.task_snapshot as task_snapshot," : "NULL as task_snapshot,"}
            r.staff_comments as staff_comments,
            r.client_comments as client_comments,
            r.report_file_url as report_file_url,
            r.uploaded_by as uploaded_by,
            r.created_at as report_created_at,
            ta.created_at,
            ta.completed_at,
            ta.assigned_by,
            ta.assigned_to,
            p_assigned_by.full_name as assigned_by_name,
            p_assigned_to.full_name as assigned_to_name
          FROM task_assignments ta
          LEFT JOIN reports r ON r.case_id = ta.id
          LEFT JOIN profiles p_assigned_by ON ta.assigned_by = p_assigned_by.id
          LEFT JOIN profiles p_assigned_to ON ta.assigned_to = p_assigned_to.id
          WHERE ta.status = 'completed'
            AND (ta.assigned_by = ? OR ta.assigned_to = ?)
          ORDER BY ta.completed_at DESC
        `
          : `
          SELECT 
            ta.id,
            ta.id as report_id,
            ta.title as patient_name,
            ta.priority as priority,
            NULL as report_html,
            NULL as staff_comments,
            NULL as client_comments,
            NULL as report_file_url,
            NULL as uploaded_by,
            NULL as report_created_at,
            ta.created_at,
            ta.completed_at,
            ta.assigned_by,
            ta.assigned_to,
            p_assigned_by.full_name as assigned_by_name,
            p_assigned_to.full_name as assigned_to_name
          FROM task_assignments ta
          LEFT JOIN profiles p_assigned_by ON ta.assigned_by = p_assigned_by.id
          LEFT JOIN profiles p_assigned_to ON ta.assigned_to = p_assigned_to.id
          WHERE ta.status = 'completed'
            AND (ta.assigned_by = ? OR ta.assigned_to = ?)
          ORDER BY ta.completed_at DESC
        `,
        [decoded.id, decoded.id],
      )
    }

    // report_html을 DB에 저장하지 않더라도, 기존 UI 호환을 위해 응답에서만 생성
    const reportsWithComputed = (reports as any[]).map((r) => {
      let taskSnapshot: any = r.task_snapshot
      if (typeof taskSnapshot === "string") {
        try { taskSnapshot = JSON.parse(taskSnapshot) } catch { /* ignore */ }
      }

      if ((!r.report_html || r.report_html === "") && taskSnapshot) {
        return { ...r, report_html: snapshotToHtml(taskSnapshot), task_snapshot: taskSnapshot }
      }
      return { ...r, task_snapshot: taskSnapshot || null }
    })

    return NextResponse.json({ reports: reportsWithComputed })
  } catch (error) {
    console.error("[v0] Error fetching reports:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST /api/reports - 새 리포트 생성
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

    // Admin/Staff만 리포트 생성 가능
    if (decoded.role !== "admin" && decoded.role !== "staff") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const formData = await request.formData()
    const taskId = formData.get("task_id") as string || formData.get("case_id") as string // case_id는 legacy 지원
    const staffComments = formData.get("staff_comments") as string
    const clientComments = formData.get("client_comments") as string
    const htmlFile = formData.get("html_file") as File | null

    if (!taskId) {
      return NextResponse.json({ error: "Task ID is required" }, { status: 400 })
    }

    // HTML 파일 S3에 업로드
    let reportFileUrl = null
    if (htmlFile) {
      const buffer = Buffer.from(await htmlFile.arrayBuffer())
      const fileName = `reports/${Date.now()}-${htmlFile.name}`
      reportFileUrl = await uploadToS3(buffer, fileName, "text/html")
    }

    // task_assignments 테이블에 리포트 정보 업데이트
    // 컬럼 존재 여부 확인
    const [columnCheck] = await query(
      `SELECT 
        SUM(CASE WHEN COLUMN_NAME = 'report_html' THEN 1 ELSE 0 END) as has_report_html,
        SUM(CASE WHEN COLUMN_NAME = 'staff_comments' THEN 1 ELSE 0 END) as has_staff_comments,
        SUM(CASE WHEN COLUMN_NAME = 'client_comments' THEN 1 ELSE 0 END) as has_client_comments
       FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'task_assignments' 
         AND COLUMN_NAME IN ('report_html', 'staff_comments', 'client_comments')`
    )

    const hasReportHtml = Number(columnCheck?.has_report_html || 0) > 0
    const hasStaffComments = Number(columnCheck?.has_staff_comments || 0) > 0
    const hasClientComments = Number(columnCheck?.has_client_comments || 0) > 0

    // HTML 파일 내용 읽기 (있는 경우)
    let reportHtmlContent = null
    if (htmlFile) {
      const buffer = Buffer.from(await htmlFile.arrayBuffer())
      reportHtmlContent = buffer.toString('utf-8')
    }

    // taskId는 이미 위에서 설정됨

    // 현재 status 확인
    const [currentTask] = await query(
      "SELECT status FROM task_assignments WHERE id = ?",
      [taskId]
    )
    const oldStatus = currentTask?.status

    // 동적 쿼리 구성
    const updateFields: string[] = []
    const updateValues: any[] = []

    if (hasReportHtml && reportHtmlContent) {
      updateFields.push('report_html = ?')
      updateValues.push(reportHtmlContent)
    }
    if (hasStaffComments) {
      updateFields.push('staff_comments = ?')
      updateValues.push(staffComments || null)
    }
    if (hasClientComments) {
      updateFields.push('client_comments = ?')
      updateValues.push(clientComments || null)
    }
    updateFields.push('status = ?')
    updateValues.push('completed')
    updateFields.push("completed_at = NOW()")
    updateFields.push("updated_at = NOW()")
    updateValues.push(taskId)

    await query(
      `UPDATE task_assignments SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    )

    // reports 테이블 upsert (가능하면)
    try {
      const tableRows2 = await query(
        `SELECT COUNT(*) as cnt
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'reports'`
      )
      const hasReportsTable2 = Number((tableRows2 as any)?.[0]?.cnt || 0) > 0
      if (hasReportsTable2) {
        const existing = await query(
          `SELECT id FROM reports WHERE case_id = ? ORDER BY created_at DESC LIMIT 1`,
          [taskId]
        )
        const existingId = (existing as any[])?.[0]?.id || null
        if (existingId) {
          await query(
            `UPDATE reports SET report_html = COALESCE(?, report_html), staff_comments = ?, client_comments = ? WHERE id = ?`,
            [reportHtmlContent, staffComments || null, clientComments || null, existingId]
          )
        } else {
          await query(
            `INSERT INTO reports (id, case_id, report_html, staff_comments, client_comments, uploaded_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [randomUUID(), taskId, reportHtmlContent, staffComments || null, clientComments || null, decoded.id]
          )
        }
      }
    } catch {
      // ignore
    }

    // 상태가 변경된 경우 task_status_history에 기록
    if (oldStatus !== 'completed') {
      const historyId = randomUUID()
      await query(
        `INSERT INTO task_status_history (id, task_id, status, changed_by, changed_at) 
         VALUES (?, ?, ?, ?, NOW())`,
        [historyId, taskId, 'completed', decoded.id]
      )
    }

    return NextResponse.json({
      success: true,
      taskId,
    })
  } catch (error) {
    console.error("[v0] Error creating report:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
