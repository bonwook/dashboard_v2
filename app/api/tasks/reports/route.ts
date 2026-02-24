import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { query } from "@/lib/db/mysql"

// GET /api/tasks/reports - Reports에서 볼 수 있는 완료된 task 목록 조회
// (현재는 참조자(shared_with) 기능을 사용하지 않음)
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

    // reports / task_shared_with 테이블 존재 여부 확인 (환경별 스키마 차이로 500 방지)
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
    const taskAssignmentFileKeysCol = Number((await query(
      `SELECT COUNT(*) as cnt
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'task_assignments'
         AND COLUMN_NAME = 'file_keys'`
    ) as any)?.[0]?.cnt || 0) > 0
    const taskAssignmentCommentFileKeysCol = Number((await query(
      `SELECT COUNT(*) as cnt
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'task_assignments'
         AND COLUMN_NAME = 'comment_file_keys'`
    ) as any)?.[0]?.cnt || 0) > 0
    const hasStaffCommentsCol = hasReportsTable
      ? Number((await query(
          `SELECT COUNT(*) as cnt
           FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = 'reports'
             AND COLUMN_NAME = 'staff_comments'`
        ) as any)?.[0]?.cnt || 0) > 0
      : false
    const hasClientCommentsCol = hasReportsTable
      ? Number((await query(
          `SELECT COUNT(*) as cnt
           FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = 'reports'
             AND COLUMN_NAME = 'client_comments'`
        ) as any)?.[0]?.cnt || 0) > 0
      : false
    const hasReportFileUrlCol = hasReportsTable
      ? Number((await query(
          `SELECT COUNT(*) as cnt
           FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = 'reports'
             AND COLUMN_NAME = 'report_file_url'`
        ) as any)?.[0]?.cnt || 0) > 0
      : false
    const hasUploadedByCol = hasReportsTable
      ? Number((await query(
          `SELECT COUNT(*) as cnt
           FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = 'reports'
             AND COLUMN_NAME = 'uploaded_by'`
        ) as any)?.[0]?.cnt || 0) > 0
      : false
    const hasReportsReportHtmlCol = hasReportsTable
      ? Number((await query(
          `SELECT COUNT(*) as cnt
           FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = 'reports'
             AND COLUMN_NAME = 'report_html'`
        ) as any)?.[0]?.cnt || 0) > 0
      : false
    const hasTaskAssignmentsReportHtmlCol = Number((await query(
      `SELECT COUNT(*) as cnt
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'task_assignments'
         AND COLUMN_NAME = 'report_html'`
    ) as any)?.[0]?.cnt || 0) > 0

    // task_assignments 테이블에서 완료된 작업 조회
    // shared_with(참조자) 기능은 사용하지 않으므로 관련 JOIN/조회는 제거

    const reportHtmlSelect = (() => {
      // reports 테이블이 있으면 r.report_html, 없으면 ta.report_html(있을 때만)
      if (hasReportsTable) {
        if (hasReportsReportHtmlCol && hasTaskAssignmentsReportHtmlCol) return "COALESCE(r.report_html, ta.report_html) as report_html,"
        if (hasReportsReportHtmlCol) return "r.report_html as report_html,"
        if (hasTaskAssignmentsReportHtmlCol) return "ta.report_html as report_html,"
        return "NULL as report_html,"
      }
      // no reports table
      return hasTaskAssignmentsReportHtmlCol ? "ta.report_html as report_html," : "NULL as report_html,"
    })()

    const sql = hasReportsTable ? `
      SELECT 
        ta.id,
        ta.id as case_id,
        r.id as report_id,
        ta.title,
        NULL as description,
        ta.assigned_by,
        ta.assigned_to,
        ta.content,
        ta.priority,
        ${taskAssignmentFileKeysCol ? "ta.file_keys as file_keys," : "NULL as file_keys,"}
        ${taskAssignmentCommentFileKeysCol ? "ta.comment_file_keys as comment_file_keys," : "NULL as comment_file_keys,"}
        ta.completed_at,
        ${reportHtmlSelect}
        ${hasTaskSnapshotCol ? "r.task_snapshot as task_snapshot," : "NULL as task_snapshot,"}
        ${hasStaffCommentsCol ? "r.staff_comments as staff_comments," : "NULL as staff_comments,"}
        ${hasClientCommentsCol ? "r.client_comments as client_comments," : "NULL as client_comments,"}
        ${hasReportFileUrlCol ? "r.report_file_url as report_file_url," : "NULL as report_file_url,"}
        ${hasUploadedByCol ? "r.uploaded_by as uploaded_by," : "NULL as uploaded_by,"}
        r.created_at as report_created_at,
        ta.created_at,
        ta.updated_at,
        p_assigned_by.full_name as assigned_by_name,
        p_assigned_by.email as assigned_by_email,
        p_assigned_to.full_name as assigned_to_name,
        p_assigned_to.email as assigned_to_email
      FROM task_assignments ta
      LEFT JOIN reports r ON r.case_id = ta.id
      LEFT JOIN profiles p_assigned_by ON ta.assigned_by = p_assigned_by.id
      LEFT JOIN profiles p_assigned_to ON ta.assigned_to = p_assigned_to.id
      WHERE ta.status = 'completed'
        AND (ta.assigned_by = ? OR ta.assigned_to = ? OR ta.id IN (SELECT task_id FROM task_subtasks WHERE assigned_to = ?))
      ORDER BY ta.completed_at DESC
    ` : `
      SELECT 
        ta.id,
        ta.id as case_id,
        ta.id as report_id,
        ta.title,
        NULL as description,
        ta.assigned_by,
        ta.assigned_to,
        ta.content,
        ta.priority,
        ${taskAssignmentFileKeysCol ? "ta.file_keys as file_keys," : "NULL as file_keys,"}
        ${taskAssignmentCommentFileKeysCol ? "ta.comment_file_keys as comment_file_keys," : "NULL as comment_file_keys,"}
        ta.completed_at,
        ${reportHtmlSelect}
        NULL as staff_comments,
        NULL as client_comments,
        NULL as report_file_url,
        NULL as uploaded_by,
        NULL as report_created_at,
        ta.created_at,
        ta.updated_at,
        p_assigned_by.full_name as assigned_by_name,
        p_assigned_by.email as assigned_by_email,
        p_assigned_to.full_name as assigned_to_name,
        p_assigned_to.email as assigned_to_email
      FROM task_assignments ta
      LEFT JOIN profiles p_assigned_by ON ta.assigned_by = p_assigned_by.id
      LEFT JOIN profiles p_assigned_to ON ta.assigned_to = p_assigned_to.id
      WHERE ta.status = 'completed'
        AND (ta.assigned_by = ? OR ta.assigned_to = ? OR ta.id IN (SELECT task_id FROM task_subtasks WHERE assigned_to = ?))
      ORDER BY ta.completed_at DESC
    `
    const params = [decoded.id, decoded.id, decoded.id]

    const tasks = await query(sql, params)

    // Parse JSON file_keys, comment_file_keys
    const tasksWithParsedData = tasks.map((task: Record<string, unknown>) => {
      try {
        const fileKeys = typeof task.file_keys === 'string' 
          ? JSON.parse(task.file_keys) 
          : task.file_keys || []
        const commentFileKeys = typeof task.comment_file_keys === 'string'
          ? JSON.parse(task.comment_file_keys)
          : task.comment_file_keys || []
        let taskSnapshot: any = (task as any).task_snapshot
        if (typeof taskSnapshot === "string") {
          try { taskSnapshot = JSON.parse(taskSnapshot) } catch { /* ignore */ }
        }

        const computedHtml = (!task.report_html && taskSnapshot) ? snapshotToHtml(taskSnapshot) : task.report_html

        return {
          ...task,
          file_keys: fileKeys,
          comment_file_keys: commentFileKeys,
          shared_with: [],
          report_html: computedHtml,
          task_snapshot: taskSnapshot || null,
        }
      } catch {
        return {
          ...task,
          file_keys: [],
          comment_file_keys: [],
          shared_with: [],
          task_snapshot: null,
        }
      }
    })

    return NextResponse.json({ tasks: tasksWithParsedData })
  } catch (error: unknown) {
    console.error("[Tasks Reports API] Error:", error)
    const errorMessage = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

