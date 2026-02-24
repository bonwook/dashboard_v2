import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { query } from "@/lib/db/mysql"
import { writeAuditLog } from "@/lib/db/audit"
import { randomUUID } from "crypto"

// POST /api/tasks/[id]/create-report - Task를 완료하고 Reports에 저장
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get("auth-token")?.value
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const decoded = verifyToken(token)
    if (!decoded) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const { id } = await params
    const taskId = id

    // 요청자 권한 확인 (staff/admin이면 다른 유저의 task도 report 생성 가능)
    const roleRows = await query(`SELECT role FROM profiles WHERE id = ?`, [decoded.id])
    const role = roleRows && roleRows.length > 0 ? (roleRows[0] as any).role : null
    const isAdminOrStaff = role === "admin" || role === "staff"

    // Task 정보 가져오기
    const [task] = await query(
      `SELECT 
        ta.*,
        p_assigned_by.full_name as assigned_by_name,
        p_assigned_by.email as assigned_by_email,
        p_assigned_to.full_name as assigned_to_name,
        p_assigned_to.email as assigned_to_email
      FROM task_assignments ta
      LEFT JOIN profiles p_assigned_by ON ta.assigned_by = p_assigned_by.id
      LEFT JOIN profiles p_assigned_to ON ta.assigned_to = p_assigned_to.id
      WHERE ta.id = ?`,
      [taskId]
    )

    if (!task) {
      return NextResponse.json({ error: "Task를 찾을 수 없습니다" }, { status: 404 })
    }

    // 완료 처리된 task만 Report 생성 (완료 전 생성 방지)
    if (task.status !== "completed") {
      return NextResponse.json({ error: "완료된 작업만 Report를 생성할 수 있습니다" }, { status: 400 })
    }

    // 기본: assigned_to만 생성 가능. 단, staff/admin은 예외적으로 생성 가능.
    if (!isAdminOrStaff && task.assigned_to !== decoded.id) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })
    }

    // comment 컬럼에서 첫 줄 개행 제거
    const comment = task.comment ? (task.comment.startsWith('\n') ? task.comment.substring(1) : task.comment) : ''

    // reports에는 HTML을 저장하지 않고, task의 모든 내용/첨부를 그대로 스냅샷(JSON)으로 저장
    const parseJsonArray = (value: any): any[] => {
      try {
        if (Array.isArray(value)) return value
        if (typeof value === "string") return JSON.parse(value)
        return []
      } catch {
        return []
      }
    }

    // 서브태스크 정보 가져오기
    const subtasksData = await query(
      `SELECT ts.*,
        p.full_name as assigned_to_name,
        p.email as assigned_to_email
       FROM task_subtasks ts
       LEFT JOIN profiles p ON ts.assigned_to = p.id
       WHERE ts.task_id = ?`,
      [taskId]
    )

    const taskSnapshot = {
      id: task.id,
      title: task.title,
      content: task.content || null,
      description: task.description || null,
      priority: task.priority,
      status: task.status,
      assigned_by: task.assigned_by,
      assigned_to: task.assigned_to,
      assigned_by_name: task.assigned_by_name || null,
      assigned_by_email: task.assigned_by_email || null,
      assigned_to_name: task.assigned_to_name || null,
      assigned_to_email: task.assigned_to_email || null,
      comment: comment || null,
      file_keys: parseJsonArray(task.file_keys),
      comment_file_keys: parseJsonArray(task.comment_file_keys),
      due_date: (task as any).due_date || null,
      created_at: task.created_at,
      updated_at: task.updated_at,
      completed_at: task.completed_at,
      subtasks: subtasksData.map((st: any) => ({
        id: st.id,
        subtitle: st.subtitle,
        assigned_to: st.assigned_to,
        assigned_to_name: st.assigned_to_name || null,
        assigned_to_email: st.assigned_to_email || null,
        content: st.content || null,
        comment: st.comment ? (st.comment.startsWith('\n') ? st.comment.substring(1) : st.comment) : null,
        status: st.status,
        file_keys: parseJsonArray(st.file_keys),
        comment_file_keys: parseJsonArray(st.comment_file_keys),
        created_at: st.created_at,
        updated_at: st.updated_at,
        completed_at: st.completed_at,
      }))
    }

    // Report 정보를 task_assignments 테이블에 직접 저장
    
    // 우선순위 한글 변환
    const getPriorityLabel = (priority: string) => {
      switch (priority) {
        case 'urgent': return '긴급'
        case 'high': return '높음'
        case 'medium': return '보통'
        case 'low': return '낮음'
        default: return priority
      }
    }

    // 우선순위 색상
    const getPriorityColor = (priority: string) => {
      switch (priority) {
        case 'urgent': return '#ef4444'
        case 'high': return '#f97316'
        case 'medium': return '#eab308'
        case 'low': return '#3b82f6'
        default: return '#6b7280'
      }
    }

    // Report HTML 생성 (Reports 페이지 표시 형식과 유사하게)
    const reportHtml = `
      <!DOCTYPE html>
      <html lang="ko">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${task.title} - 완료된 작업 리포트</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            padding: 24px;
            background-color: #f5f5f5;
            color: #1f2937;
            line-height: 1.6;
          }
          .container {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            overflow: hidden;
          }
          .header {
            padding: 24px;
            border-bottom: 1px solid #e5e7eb;
          }
          .header h1 {
            font-size: 24px;
            font-weight: 600;
            color: #111827;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .header-info {
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
            align-items: center;
            margin-top: 12px;
          }
          .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
            color: white;
          }
          .info-text {
            font-size: 14px;
            color: #6b7280;
          }
          .content {
            padding: 24px;
          }
          .section {
            margin-bottom: 24px;
          }
          .section-title {
            font-size: 14px;
            font-weight: 500;
            color: #374151;
            margin-bottom: 8px;
          }
          .section-content {
            font-size: 14px;
            color: #6b7280;
            background-color: #f9fafb;
            padding: 12px;
            border-radius: 6px;
            white-space: pre-wrap;
            word-wrap: break-word;
          }
          .file-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .file-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background-color: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            font-size: 14px;
            color: #374151;
          }
          .file-icon {
            width: 16px;
            height: 16px;
            color: #6b7280;
          }
          .footer {
            padding: 16px 24px;
            border-top: 1px solid #e5e7eb;
            background-color: #f9fafb;
            display: flex;
            gap: 24px;
            font-size: 12px;
            color: #6b7280;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✓ ${task.title}</h1>
            <div class="header-info">
              <span class="badge" style="background-color: ${getPriorityColor(task.priority)};">
                ${getPriorityLabel(task.priority)}
              </span>
              <span class="info-text">요청자: ${task.assigned_by_name || task.assigned_by_email}</span>
              <span class="info-text">담당자: ${task.assigned_to_name || task.assigned_to_email}</span>
            </div>
          </div>
          <div class="content">
            ${task.content ? `
            <div class="section">
              <div class="section-title">내용</div>
              <div class="section-content">${task.content.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>
            </div>
            ` : ''}
            ${comment ? `
            <div class="section">
              <div class="section-title">comment</div>
              <div class="section-content">${comment.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>
            </div>
            ` : ''}
            ${task.file_keys && task.file_keys.length > 0 ? `
            <div class="section">
              <div class="section-title">첨부 파일 (${task.file_keys.length}개)</div>
              <div class="file-list">
                ${task.file_keys.map((fileKey: string) => `
                  <div class="file-item">
                    <svg class="file-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    ${fileKey.split('/').pop() || fileKey}
                  </div>
                `).join('')}
              </div>
            </div>
            ` : ''}
          </div>
          <div class="footer">
            <span>생성일: ${new Date(task.created_at).toLocaleString('ko-KR')}</span>
            <span>완료일: ${task.completed_at ? new Date(task.completed_at).toLocaleString('ko-KR') : new Date().toLocaleString('ko-KR')}</span>
          </div>
        </div>
      </body>
      </html>
    `

    // reports 테이블에도 저장 (요청: DB reports에 매핑)
    try {
      const tableRows = await query(
        `SELECT COUNT(*) as cnt
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'reports'`
      )
      const hasReportsTable = Number((tableRows as any)?.[0]?.cnt || 0) > 0

      if (hasReportsTable) {
        // task_snapshot 컬럼이 없으면 추가 (요청사항)
        try {
          const snapshotCol = await query(
            `SELECT COUNT(*) as cnt
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'reports'
               AND COLUMN_NAME = 'task_snapshot'`
          )
          const hasSnapshot = Number((snapshotCol as any)?.[0]?.cnt || 0) > 0
          if (!hasSnapshot) {
            await query(`ALTER TABLE reports ADD COLUMN task_snapshot JSON DEFAULT NULL`)
          }
        } catch {
          // ignore
        }

        const cols = await query(
          `SELECT COLUMN_NAME
           FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = 'reports'
             AND COLUMN_NAME IN ('id','task_id','case_id','task_snapshot','report_html','staff_comments','client_comments','uploaded_by','created_at')`
        )
        const colSet = new Set((cols as any[]).map((r) => r.COLUMN_NAME))

        const keyCol = colSet.has("task_id") ? "task_id" : (colSet.has("case_id") ? "case_id" : null)
        const uploaderCol = colSet.has("uploaded_by") ? "uploaded_by" : null

        if (keyCol) {
          const existing = await query(
            `SELECT id FROM reports WHERE ${keyCol} = ? ORDER BY created_at DESC LIMIT 1`,
            [taskId]
          )
          const existingId = (existing as any[])?.[0]?.id || null

          if (existingId) {
            const updateFields: string[] = []
            const updateValues: any[] = []
            if (colSet.has("task_snapshot")) { updateFields.push("task_snapshot = ?"); updateValues.push(JSON.stringify(taskSnapshot)) }
            if (colSet.has("staff_comments")) { updateFields.push("staff_comments = ?"); updateValues.push(null) }
            if (colSet.has("client_comments")) { updateFields.push("client_comments = ?"); updateValues.push(comment || null) }
            if (updateFields.length) {
              await query(
                `UPDATE reports SET ${updateFields.join(", ")} WHERE id = ?`,
                [...updateValues, existingId]
              )
            }
          } else {
            // Insert new report row
            const reportId = randomUUID()
            const insertCols: string[] = ["id", keyCol]
            const insertVals: any[] = [reportId, taskId]
            if (colSet.has("task_snapshot")) { insertCols.push("task_snapshot"); insertVals.push(JSON.stringify(taskSnapshot)) }
            if (colSet.has("staff_comments")) { insertCols.push("staff_comments"); insertVals.push(null) }
            if (colSet.has("client_comments")) { insertCols.push("client_comments"); insertVals.push(comment || null) }
            if (uploaderCol) { insertCols.push(uploaderCol); insertVals.push(decoded.id) }

            const placeholders = insertCols.map(() => "?").join(", ")
            await query(
              `INSERT INTO reports (${insertCols.join(", ")}) VALUES (${placeholders})`,
              insertVals
            )
          }
        }
      }
    } catch {
      // reports 테이블이 없거나 스키마가 다른 경우에도 기존 task_assignments 기반 저장은 유지
    }

    // task_assignments 테이블에 report 정보 업데이트
    // report_html, staff_comments, client_comments 컬럼 존재 여부 확인
    const [columnCheck] = await query(
      `SELECT 
        SUM(CASE WHEN COLUMN_NAME = 'staff_comments' THEN 1 ELSE 0 END) as has_staff_comments,
        SUM(CASE WHEN COLUMN_NAME = 'client_comments' THEN 1 ELSE 0 END) as has_client_comments
       FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'task_assignments' 
         AND COLUMN_NAME IN ('staff_comments', 'client_comments')`
    )

    const hasStaffComments = Number(columnCheck?.has_staff_comments || 0) > 0
    const hasClientComments = Number(columnCheck?.has_client_comments || 0) > 0

    // task_assignments 테이블 업데이트 (동적 쿼리 구성)
    const updateFields: string[] = []
    const updateValues: any[] = []

    if (hasStaffComments) {
      updateFields.push('staff_comments = ?')
      updateValues.push(null) // description은 더 이상 사용하지 않음
    }
    if (hasClientComments) {
      updateFields.push('client_comments = ?')
      updateValues.push(comment || null)
    }
    
    updateFields.push("updated_at = NOW()")
    updateValues.push(task.id)

    if (updateFields.length > 1) {
      await query(
        `UPDATE task_assignments SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      )
    }

    await writeAuditLog({
      request,
      userId: decoded.id,
      action: "report.created",
      taskId,
      details: { via: "api/tasks/[id]/create-report" },
    })

    return NextResponse.json({
      success: true,
      message: "Report가 생성되었습니다",
      taskId: task.id,
    })
  } catch (error: unknown) {
    console.error("[Tasks API] Error creating report:", error)
    const errorMessage = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

