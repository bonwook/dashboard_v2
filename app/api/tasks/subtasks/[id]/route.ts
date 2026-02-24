import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { query } from "@/lib/db/mysql"

// PATCH /api/tasks/subtasks/[id] - 서브태스크 상태 업데이트
export async function PATCH(
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
    const subtaskId = id

    // 사용자 역할 확인
    const userRoleRes = await query(
      `SELECT role FROM profiles WHERE id = ?`,
      [decoded.id]
    )
    const userRole = userRoleRes && userRoleRes.length > 0 ? userRoleRes[0].role : null
    const isAdminOrStaff = userRole === "admin" || userRole === "staff"

    // Subtask 확인
    const [subtask] = await query(
      `SELECT ts.*, ta.assigned_by 
       FROM task_subtasks ts
       INNER JOIN task_assignments ta ON ts.task_id = ta.id
       WHERE ts.id = ?`,
      [subtaskId]
    )

    if (!subtask) {
      return NextResponse.json({ error: "서브태스크를 찾을 수 없습니다" }, { status: 404 })
    }

    // 권한 확인: admin/staff는 모든 subtask 업데이트 가능, 
    // 그 외는 자신이 담당자이거나 메인 task 생성자인 경우만 가능
    if (!isAdminOrStaff && subtask.assigned_to !== decoded.id && subtask.assigned_by !== decoded.id) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const { status } = body

    if (!status) {
      return NextResponse.json({ error: "status가 필요합니다" }, { status: 400 })
    }

    // 허용된 상태 값 확인
    const allowedStatuses = ['pending', 'in_progress', 'on_hold', 'awaiting_completion', 'completed']
    if (!allowedStatuses.includes(status)) {
      return NextResponse.json({ error: "유효하지 않은 상태입니다" }, { status: 400 })
    }

    // 상태 업데이트
    const updateFields: string[] = ['status = ?']
    const updateValues: any[] = [status]

    // completed 상태로 변경 시 completed_at 설정
    if (status === 'completed') {
      updateFields.push('completed_at = NOW()')
    }

    await query(
      `UPDATE task_subtasks SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = ?`,
      [...updateValues, subtaskId]
    )

    // completed 상태로 변경 시 report 업데이트
    if (status === 'completed') {
      try {
        // 업데이트된 서브태스크 정보 가져오기
        const [updatedSubtask] = await query(
          `SELECT ts.*, 
            p_assigned_to.full_name as assigned_to_name,
            p_assigned_to.email as assigned_to_email
           FROM task_subtasks ts
           LEFT JOIN profiles p_assigned_to ON ts.assigned_to = p_assigned_to.id
           WHERE ts.id = ?`,
          [subtaskId]
        )

        if (updatedSubtask) {
          // 메인 task 정보 가져오기
          const [mainTask] = await query(
            `SELECT ta.*,
              p_assigned_by.full_name as assigned_by_name,
              p_assigned_by.email as assigned_by_email
             FROM task_assignments ta
             LEFT JOIN profiles p_assigned_by ON ta.assigned_by = p_assigned_by.id
             WHERE ta.id = ?`,
            [subtask.task_id]
          )

          if (mainTask) {
            // 모든 서브태스크 가져오기
            const allSubtasks = await query(
              `SELECT ts.*,
                p.full_name as assigned_to_name,
                p.email as assigned_to_email
               FROM task_subtasks ts
               LEFT JOIN profiles p ON ts.assigned_to = p.id
               WHERE ts.task_id = ?`,
              [subtask.task_id]
            )

            // report 업데이트 (reports 테이블 확인)
            const tableCheck = await query(
              `SELECT COUNT(*) as cnt
               FROM information_schema.TABLES
               WHERE TABLE_SCHEMA = DATABASE()
                 AND TABLE_NAME = 'reports'`
            )
            const hasReportsTable = Number((tableCheck as any)?.[0]?.cnt || 0) > 0

            if (hasReportsTable) {
              // task_snapshot 컬럼이 있는지 확인
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

              // JSON 파싱 헬퍼
              const parseJsonArray = (value: any): any[] => {
                try {
                  if (Array.isArray(value)) return value
                  if (typeof value === "string") return JSON.parse(value)
                  return []
                } catch {
                  return []
                }
              }

              // task snapshot 생성 (서브태스크 정보 포함)
              const taskSnapshot = {
                id: mainTask.id,
                title: mainTask.title,
                content: mainTask.content || null,
                description: mainTask.description || null,
                priority: mainTask.priority,
                status: mainTask.status,
                assigned_by: mainTask.assigned_by,
                assigned_by_name: mainTask.assigned_by_name || null,
                assigned_by_email: mainTask.assigned_by_email || null,
                file_keys: parseJsonArray(mainTask.file_keys),
                due_date: mainTask.due_date || null,
                created_at: mainTask.created_at,
                updated_at: mainTask.updated_at,
                completed_at: mainTask.completed_at,
                subtasks: allSubtasks.map((st: any) => ({
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

              // reports 테이블에 report가 있는지 확인
              const existing = await query(
                `SELECT id FROM reports WHERE case_id = ? ORDER BY created_at DESC LIMIT 1`,
                [subtask.task_id]
              )

              if (existing && existing.length > 0) {
                // 기존 report 업데이트
                await query(
                  `UPDATE reports SET task_snapshot = ? WHERE id = ?`,
                  [JSON.stringify(taskSnapshot), (existing as any)[0].id]
                )
              }
            }
          }
        }
      } catch (reportError) {
        console.error("[Subtask Complete] Report update error:", reportError)
        // report 업데이트 실패해도 서브태스크 완료는 성공으로 처리
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("[Subtask Update API] Error:", error)
    const errorMessage = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
