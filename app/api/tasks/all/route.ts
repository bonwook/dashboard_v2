import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { query } from "@/lib/db/mysql"

// GET /api/tasks/all - Admin/Staff가 모든 task 목록 조회
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

    // Check if user is admin or staff
    const userRoleRes = await query(
      `SELECT role FROM profiles WHERE id = ?`,
      [decoded.id]
    )

    if (!userRoleRes || userRoleRes.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const userRole = userRoleRes[0].role
    if (userRole !== "admin" && userRole !== "staff") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") // optional filter

    let sql = `
      SELECT 
        ta.*,
        p_assigned_by.full_name as assigned_by_name,
        p_assigned_by.email as assigned_by_email,
        p_assigned_to.full_name as assigned_to_name,
        p_assigned_to.email as assigned_to_email
      FROM task_assignments ta
      LEFT JOIN profiles p_assigned_by ON ta.assigned_by = p_assigned_by.id
      LEFT JOIN profiles p_assigned_to ON ta.assigned_to = p_assigned_to.id
      WHERE 1=1
    `
    const params: (string | number)[] = []

    if (status) {
      sql += " AND ta.status = ?"
      params.push(status)
    }

    sql += " ORDER BY ta.created_at DESC"

    const tasks = await query(sql, params)

    // Parse JSON file_keys and comment_file_keys, normalize is_multi_assign
    const tasksWithParsedKeys = tasks.map((task: Record<string, unknown>) => {
      try {
        const fileKeys = typeof task.file_keys === 'string'
          ? JSON.parse(task.file_keys)
          : task.file_keys || []
        const commentFileKeys = typeof task.comment_file_keys === 'string'
          ? JSON.parse(task.comment_file_keys)
          : task.comment_file_keys || []
        return {
          ...task,
          file_keys: fileKeys,
          comment_file_keys: commentFileKeys,
          is_multi_assign: Boolean(task.is_multi_assign),
        }
      } catch {
        return {
          ...task,
          file_keys: [],
          comment_file_keys: [],
          is_multi_assign: Boolean(task.is_multi_assign),
        }
      }
    })

    // 서브태스크 중 첨부가 하나라도 있는지 조회 (담당자 중 한 명이라도 올렸으면 표시)
    const taskIds = tasksWithParsedKeys.map((t: Record<string, unknown>) => t.id).filter(Boolean)
    let subtaskFiles: { task_id: string; file_keys: unknown; comment_file_keys: unknown }[] = []
    if (taskIds.length > 0) {
      const placeholders = taskIds.map(() => "?").join(",")
      subtaskFiles = await query(
        `SELECT task_id, file_keys, comment_file_keys FROM task_subtasks WHERE task_id IN (${placeholders})`,
        taskIds
      )
    }

    const hasAttachmentFromSubtask = (taskId: string) => {
      return subtaskFiles.some((st: Record<string, unknown>) => {
        if (st.task_id !== taskId) return false
        try {
          const fk = typeof st.file_keys === "string" ? JSON.parse(st.file_keys) : st.file_keys || []
          const cfk = typeof st.comment_file_keys === "string" ? JSON.parse(st.comment_file_keys) : st.comment_file_keys || []
          return (Array.isArray(fk) && fk.length > 0) || (Array.isArray(cfk) && cfk.length > 0)
        } catch {
          return false
        }
      })
    }

    const tasksWithAttachment = tasksWithParsedKeys.map((task: Record<string, unknown>) => {
      const fileKeys = (task.file_keys as string[]) || []
      const commentFileKeys = (task.comment_file_keys as string[]) || []
      const taskHasFiles = fileKeys.length > 0 || commentFileKeys.length > 0
      const anySubtaskHasFiles = hasAttachmentFromSubtask(task.id as string)
      return {
        ...task,
        has_any_attachment: taskHasFiles || anySubtaskHasFiles,
      }
    })

    return NextResponse.json({ tasks: tasksWithAttachment })
  } catch (error: unknown) {
    console.error("[Tasks All API] Error fetching tasks:", error)
    const errorMessage = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
