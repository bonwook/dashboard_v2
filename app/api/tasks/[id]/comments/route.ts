import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { query } from "@/lib/db/mysql"
import { randomUUID } from "crypto"

async function ensureCommentsTable() {
  // best-effort: 테이블이 없으면 생성
  // task_id는 메인 태스크 또는 서브태스크 ID를 저장할 수 있으므로 FOREIGN KEY 제약 없이 사용
  await query(`
    CREATE TABLE IF NOT EXISTS task_comments (
      id CHAR(36) PRIMARY KEY,
      task_id CHAR(36) NOT NULL COMMENT 'Main task ID or subtask ID',
      user_id CHAR(36) DEFAULT NULL COMMENT 'User who wrote the comment',
      content TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL,
      INDEX idx_task_comments_task_id (task_id),
      INDEX idx_task_comments_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  
  // 기존 테이블에 FOREIGN KEY 제약이 있다면 제거 (에러 무시)
  try {
    // fk_task_comments_task_id 제약 조건 제거 시도
    await query(`
      ALTER TABLE task_comments 
      DROP FOREIGN KEY fk_task_comments_task_id
    `).catch(() => {})
  } catch {
    // 제약 조건이 없으면 무시
  }
  
  try {
    // task_comments_ibfk_1 제약 조건 제거 시도 (기존 코드 유지)
    await query(`
      ALTER TABLE task_comments 
      DROP FOREIGN KEY task_comments_ibfk_1
    `).catch(() => {})
  } catch {
    // 제약 조건이 없으면 무시
  }
}

async function canAccessComments(userId: string, role: string | null, taskId: string) {
  const isAdminOrStaff = role === "admin" || role === "staff"
  if (isAdminOrStaff) return true
  
  // 메인 태스크 확인 (서브태스크 담당자도 허용: 공동 업무)
  const taskRows = await query(`SELECT assigned_to, assigned_by FROM task_assignments WHERE id = ?`, [taskId])
  const task = (taskRows as any[])?.[0]
  if (task) {
    if (task.assigned_to === userId || task.assigned_by === userId) return true
    const subtaskAssign = await query(
      "SELECT 1 FROM task_subtasks WHERE task_id = ? AND assigned_to = ? LIMIT 1",
      [taskId, userId]
    )
    return Array.isArray(subtaskAssign) && subtaskAssign.length > 0
  }
  
  // 서브태스크 확인: 담당자·요청자 또는 메인 태스크의 요청자/담당자도 허용
  const subtaskRows = await query(
    `SELECT ts.assigned_to, ts.task_id, ta.assigned_by, ta.assigned_to AS main_assigned_to
     FROM task_subtasks ts 
     INNER JOIN task_assignments ta ON ts.task_id = ta.id 
     WHERE ts.id = ?`,
    [taskId]
  )
  const subtask = (subtaskRows as any[])?.[0]
  if (subtask) {
    // 서브태스크 담당자, 메인 태스크 요청자(assigned_by), 메인 태스크 담당자(main_assigned_to) 허용
    return subtask.assigned_to === userId || subtask.assigned_by === userId || subtask.main_assigned_to === userId
  }

  return false
}

// GET /api/tasks/[id]/comments - 댓글 목록
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = request.cookies.get("auth-token")?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const decoded = verifyToken(token)
    if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

    const { id } = await params
    const taskId = id

    const roleRows = await query(`SELECT role FROM profiles WHERE id = ?`, [decoded.id])
    const role = (roleRows as any[])?.[0]?.role || null
    const allowed = await canAccessComments(decoded.id, role, taskId)
    if (!allowed) return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })

    await ensureCommentsTable()

    // 메인 태스크면 메인+해당 메인 소속 서브 전부의 댓글을 한 번에 반환 (요청자/담당자 모두 동일 목록)
    const mainTaskRows = await query(`SELECT id FROM task_assignments WHERE id = ?`, [taskId])
    const isMainTask = Array.isArray(mainTaskRows) && mainTaskRows.length > 0

    let comments: unknown[]
    if (isMainTask) {
      const subtaskRows = await query(
        `SELECT id FROM task_subtasks WHERE task_id = ?`,
        [taskId],
      )
      const subtaskIds = Array.isArray(subtaskRows)
        ? (subtaskRows as { id?: string }[]).map((r) => r?.id).filter((id): id is string => typeof id === "string" && id.length > 0)
        : []
      const allTaskIds = [taskId, ...subtaskIds]
      const placeholders = allTaskIds.map(() => "?").join(", ")
      comments = await query(
        `
        SELECT
          c.id,
          c.task_id,
          c.user_id,
          c.content,
          c.created_at,
          p.full_name
        FROM task_comments c
        LEFT JOIN profiles p ON c.user_id = p.id
        WHERE c.task_id IN (${placeholders})
        ORDER BY c.created_at ASC
        `,
        allTaskIds,
      )
    } else {
      comments = await query(
        `
        SELECT
          c.id,
          c.task_id,
          c.user_id,
          c.content,
          c.created_at,
          p.full_name
        FROM task_comments c
        LEFT JOIN profiles p ON c.user_id = p.id
        WHERE c.task_id = ?
        ORDER BY c.created_at ASC
        `,
        [taskId],
      )
    }

    return NextResponse.json({ comments: Array.isArray(comments) ? comments : [] })
  } catch (error) {
    console.error("[Task Comments API] GET error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST /api/tasks/[id]/comments - 댓글 작성
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = request.cookies.get("auth-token")?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const decoded = verifyToken(token)
    if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

    const { id } = await params
    const taskId = id

    const roleRows = await query(`SELECT role FROM profiles WHERE id = ?`, [decoded.id])
    const role = (roleRows as any[])?.[0]?.role || null
    const allowed = await canAccessComments(decoded.id, role, taskId)
    if (!allowed) return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })

    await ensureCommentsTable()

    const body = await request.json().catch(() => ({}))
    const content = typeof body?.content === "string" ? body.content.trim() : ""
    if (!content) return NextResponse.json({ error: "댓글 내용이 필요합니다" }, { status: 400 })

    const idRow = randomUUID()
    await query(
      `INSERT INTO task_comments (id, task_id, user_id, content, created_at) VALUES (?, ?, ?, ?, NOW())`,
      [idRow, taskId, decoded.id, content],
    )

    return NextResponse.json({ success: true, id: idRow })
  } catch (error) {
    console.error("[Task Comments API] POST error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE /api/tasks/[id]/comments?commentId=... - 댓글 삭제
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = request.cookies.get("auth-token")?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const decoded = verifyToken(token)
    if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

    const { id } = await params
    const taskId = id

    const { searchParams } = new URL(request.url)
    const commentId = searchParams.get("commentId")
    if (!commentId) return NextResponse.json({ error: "commentId가 필요합니다" }, { status: 400 })

    const roleRows = await query(`SELECT role FROM profiles WHERE id = ?`, [decoded.id])
    const role = (roleRows as any[])?.[0]?.role || null
    const isAdminOrStaff = role === "admin" || role === "staff"

    const allowed = await canAccessComments(decoded.id, role, taskId)
    if (!allowed) return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })

    await ensureCommentsTable()

    const rows = await query(
      `SELECT id, user_id FROM task_comments WHERE id = ? AND task_id = ?`,
      [commentId, taskId],
    )
    const comment = (rows as any[])?.[0]
    if (!comment) return NextResponse.json({ error: "댓글을 찾을 수 없습니다" }, { status: 404 })

    // admin/staff는 타인 댓글 삭제 가능, 그 외는 본인 댓글만
    if (!isAdminOrStaff && comment.user_id !== decoded.id) {
      return NextResponse.json({ error: "본인 댓글만 삭제할 수 있습니다" }, { status: 403 })
    }

    await query(`DELETE FROM task_comments WHERE id = ? AND task_id = ?`, [commentId, taskId])
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Task Comments API] DELETE error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
