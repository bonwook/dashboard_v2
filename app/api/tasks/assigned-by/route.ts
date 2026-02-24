import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { query } from "@/lib/db/mysql"

// GET /api/tasks/assigned-by - 현재 사용자가 등록한 task 목록 조회 (개별 할당 및 다중 할당 모두 지원)
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

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") // optional filter

    // 개별 할당 task 가져오기
    let sql = `
      SELECT 
        ta.*,
        p_assigned_to.full_name as assigned_to_name,
        p_assigned_to.email as assigned_to_email
      FROM task_assignments ta
      LEFT JOIN profiles p_assigned_to ON ta.assigned_to = p_assigned_to.id
      WHERE ta.assigned_by = ? AND (ta.is_multi_assign = 0 OR ta.is_multi_assign IS NULL)
    `
    const params: (string | number)[] = [decoded.id]

    if (status) {
      sql += " AND ta.status = ?"
      params.push(status)
    }

    sql += " ORDER BY ta.created_at DESC"

    const singleTasks = await query(sql, params)

    // 다중 할당 task의 subtask 가져오기 (assigned_by가 현재 사용자인 경우, subtitle 포함)
    let subtaskSql = `
      SELECT 
        ts.*,
        ts.subtitle,
        ta.title,
        ta.priority,
        ta.due_date,
        ta.assigned_by,
        ta.created_at as task_created_at,
        p_assigned_by.full_name as assigned_by_name,
        p_assigned_by.email as assigned_by_email,
        p_assigned_to.full_name as assigned_to_name,
        p_assigned_to.email as assigned_to_email
      FROM task_subtasks ts
      INNER JOIN task_assignments ta ON ts.task_id = ta.id
      LEFT JOIN profiles p_assigned_by ON ta.assigned_by = p_assigned_by.id
      LEFT JOIN profiles p_assigned_to ON ts.assigned_to = p_assigned_to.id
      WHERE ta.assigned_by = ?
    `
    const subtaskParams: (string | number)[] = [decoded.id]

    if (status) {
      subtaskSql += " AND ts.status = ?"
      subtaskParams.push(status)
    }

    subtaskSql += " ORDER BY ta.created_at DESC"

    const subtasks = await query(subtaskSql, subtaskParams)

    // Parse JSON and combine results
    const allTasks = [
      ...singleTasks.map((task: Record<string, unknown>) => parseTaskKeys(task, false)),
      ...subtasks.map((subtask: Record<string, unknown>) => parseSubtaskKeys(subtask))
    ]

    // Sort by created_at (descending)
    allTasks.sort((a, b) => {
      const dateA = new Date((a.created_at as string | number) || 0).getTime()
      const dateB = new Date((b.created_at as string | number) || 0).getTime()
      return dateB - dateA
    })

    return NextResponse.json({ tasks: allTasks })
  } catch (error: unknown) {
    console.error("[Tasks Assigned By API] Error fetching tasks:", error)
    const errorMessage = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

function parseTaskKeys(task: Record<string, unknown>, isMultiAssign: boolean) {
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
      is_multi_assign: isMultiAssign,
      is_subtask: false,
      created_at: task.created_at,
    }
  } catch {
    return {
      ...task,
      file_keys: [],
      comment_file_keys: [],
      is_multi_assign: isMultiAssign,
      is_subtask: false,
      created_at: task.created_at,
    }
  }
}

function parseSubtaskKeys(subtask: Record<string, unknown>) {
  try {
    const fileKeys = typeof subtask.file_keys === 'string' 
      ? JSON.parse(subtask.file_keys) 
      : subtask.file_keys || []
    
    const commentFileKeys = typeof subtask.comment_file_keys === 'string'
      ? JSON.parse(subtask.comment_file_keys)
      : subtask.comment_file_keys || []

    return {
      ...subtask,
      subtitle: subtask.subtitle || '',
      file_keys: fileKeys,
      comment_file_keys: commentFileKeys,
      is_multi_assign: true,
      is_subtask: true,
      created_at: subtask.task_created_at || subtask.created_at,
    }
  } catch {
    return {
      ...subtask,
      subtitle: subtask.subtitle || '',
      file_keys: [],
      comment_file_keys: [],
      is_multi_assign: true,
      is_subtask: true,
      created_at: subtask.task_created_at || subtask.created_at,
    }
  }
}

