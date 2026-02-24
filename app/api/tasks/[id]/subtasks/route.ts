import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { query } from "@/lib/db/mysql"

// GET /api/tasks/[id]/subtasks - 특정 Task의 Subtask 목록 조회
export async function GET(
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

    // 사용자 역할 확인
    const userRoleRes = await query(
      `SELECT role FROM profiles WHERE id = ?`,
      [decoded.id]
    )
    const userRole = userRoleRes && userRoleRes.length > 0 ? userRoleRes[0].role : null
    const isAdminOrStaff = userRole === "admin" || userRole === "staff"

    // Task 확인 및 권한 체크
    const [task] = await query(
      "SELECT id, assigned_to, assigned_by, assignment_type FROM task_assignments WHERE id = ?",
      [taskId]
    )

    if (!task) {
      return NextResponse.json({ error: "Task를 찾을 수 없습니다" }, { status: 404 })
    }

    // 권한: admin/staff, 메인 담당자·요청자, 또는 이 메인 업무의 서브태스크 담당자(공동 업무)
    const isMainParty = task.assigned_to === decoded.id || task.assigned_by === decoded.id
    let isSubtaskAssignee = false
    if (!isAdminOrStaff && !isMainParty) {
      const subtaskAssign = await query(
        "SELECT 1 FROM task_subtasks WHERE task_id = ? AND assigned_to = ? LIMIT 1",
        [taskId, decoded.id]
      )
      isSubtaskAssignee = Array.isArray(subtaskAssign) && subtaskAssign.length > 0
    }
    if (!isAdminOrStaff && !isMainParty && !isSubtaskAssignee) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })
    }

    // Subtask 목록 가져오기
    const subtasks = await query(`
      SELECT 
        ts.*,
        p_assigned_to.full_name as assigned_to_name,
        p_assigned_to.email as assigned_to_email
      FROM task_subtasks ts
      LEFT JOIN profiles p_assigned_to ON ts.assigned_to = p_assigned_to.id
      WHERE ts.task_id = ?
      ORDER BY ts.created_at ASC
    `, [taskId])

    const subtaskIds = (subtasks as any[]).map((s: any) => s.id)
    let attachmentsBySubtask: Record<string, { file_keys: Array<{ key: string; uploaded_at: string | null }>; comment_file_keys: Array<{ key: string; uploaded_at: string | null }> }> = {}
    if (subtaskIds.length > 0) {
      try {
        const placeholders = subtaskIds.map(() => "?").join(",")
        const rows = await query(
          `SELECT subtask_id, s3_key, attachment_type, uploaded_at FROM task_file_attachments WHERE task_id = ? AND subtask_id IN (${placeholders}) ORDER BY created_at ASC`,
          [taskId, ...subtaskIds]
        )
        for (const sid of subtaskIds) {
          attachmentsBySubtask[sid] = { file_keys: [], comment_file_keys: [] }
        }
        for (const r of rows as any[]) {
          const sid = r.subtask_id
          if (!sid || !attachmentsBySubtask[sid]) continue
          const item = { key: r.s3_key, uploaded_at: r.uploaded_at ?? null }
          if (r.attachment_type === "requester") attachmentsBySubtask[sid].file_keys.push(item)
          else attachmentsBySubtask[sid].comment_file_keys.push(item)
        }
      } catch {
        // 테이블 없으면 무시
      }
    }

    // Parse JSON file_keys, comment_file_keys; task_file_attachments 있으면 해당 값 사용
    const parsedSubtasks = subtasks.map((subtask: any) => {
      const fromTable = attachmentsBySubtask[subtask.id]
      if (fromTable && (fromTable.file_keys.length > 0 || fromTable.comment_file_keys.length > 0)) {
        return {
          ...subtask,
          file_keys: fromTable.file_keys,
          comment_file_keys: fromTable.comment_file_keys,
        }
      }
      try {
        const fileKeys = typeof subtask.file_keys === "string" ? JSON.parse(subtask.file_keys) : subtask.file_keys || []
        const commentFileKeys = typeof subtask.comment_file_keys === "string" ? JSON.parse(subtask.comment_file_keys) : subtask.comment_file_keys || []
        const fk = Array.isArray(fileKeys) ? fileKeys.map((k: any) => (typeof k === "object" && k?.key != null ? { key: k.key, uploaded_at: k.uploaded_at ?? null } : { key: String(k), uploaded_at: null })) : []
        const cfk = Array.isArray(commentFileKeys) ? commentFileKeys.map((k: any) => (typeof k === "object" && k?.key != null ? { key: k.key, uploaded_at: k.uploaded_at ?? null } : { key: String(k), uploaded_at: null })) : []
        return {
          ...subtask,
          file_keys: fk,
          comment_file_keys: cfk,
        }
      } catch {
        return {
          ...subtask,
          file_keys: [],
          comment_file_keys: [],
        }
      }
    })

    return NextResponse.json({ 
      subtasks: parsedSubtasks,
      assignment_type: task.assignment_type || 'individual'
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
