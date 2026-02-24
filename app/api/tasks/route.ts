import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { query } from "@/lib/db/mysql"

// GET /api/tasks - 현재 사용자에게 지정된 task 목록 조회 (개별 할당 및 다중 할당 모두 지원)
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

    // 메인 task 가져오기 (개별 할당) — 메인 완료된 건 받은 요청에서 제외
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
      WHERE ta.assigned_to = ? AND ta.status != 'completed'
    `
    const params: (string | number)[] = [decoded.id]

    if (status) {
      sql += " AND ta.status = ?"
      params.push(status)
    }

    sql += " ORDER BY ta.created_at ASC"

    const singleTasks = await query(sql, params)

    // 다중 할당 task의 subtask 가져오기 — 메인 task가 완료된 경우 받은 요청에서 제외
    let subtaskSql = `
      SELECT 
        ts.*,
        ts.subtitle,
        ta.title,
        ta.priority,
        ta.due_date,
        ta.assigned_by,
        ta.assignment_type,
        ta.created_at as task_created_at,
        p_assigned_by.full_name as assigned_by_name,
        p_assigned_by.email as assigned_by_email,
        p_assigned_to.full_name as assigned_to_name,
        p_assigned_to.email as assigned_to_email
      FROM task_subtasks ts
      INNER JOIN task_assignments ta ON ts.task_id = ta.id AND ta.status != 'completed'
      LEFT JOIN profiles p_assigned_by ON ta.assigned_by = p_assigned_by.id
      LEFT JOIN profiles p_assigned_to ON ts.assigned_to = p_assigned_to.id
      WHERE ts.assigned_to = ?
    `
    const subtaskParams: (string | number)[] = [decoded.id]

    if (status) {
      subtaskSql += " AND ts.status = ?"
      subtaskParams.push(status)
    }

    subtaskSql += " ORDER BY ta.created_at ASC"

    const subtasks = await query(subtaskSql, subtaskParams)

    // Parse JSON and combine results
    const allTasks = [
      ...singleTasks.map((task: Record<string, unknown>) => parseTaskKeys(task)),
      ...subtasks.map((subtask: Record<string, unknown>) => parseSubtaskKeys(subtask))
    ]

    // Sort by created_at
    allTasks.sort((a, b) => {
      const dateA = new Date((a.created_at as string | number) || 0).getTime()
      const dateB = new Date((b.created_at as string | number) || 0).getTime()
      return dateA - dateB
    })

    return NextResponse.json({ tasks: allTasks })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

function parseTaskKeys(task: Record<string, unknown>) {
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
      shared_with: [],
      is_multi_assign: task.is_multi_assign || false,
      assignment_type: task.assignment_type || 'single',
      created_at: task.created_at,
    }
  } catch {
    return {
      ...task,
      file_keys: [],
      comment_file_keys: [],
      shared_with: [],
      is_multi_assign: task.is_multi_assign || false,
      assignment_type: task.assignment_type || 'single',
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
      id: subtask.id,
      task_id: subtask.task_id,
      subtitle: subtask.subtitle || '',
      assigned_to: subtask.assigned_to,
      assigned_by: subtask.assigned_by,
      title: subtask.title,
      content: subtask.content,
      priority: subtask.priority,
      status: subtask.status,
      due_date: subtask.due_date,
      file_keys: fileKeys,
      comment: subtask.comment,
      comment_file_keys: commentFileKeys,
      created_at: subtask.task_created_at || subtask.created_at,
      updated_at: subtask.updated_at,
      completed_at: subtask.completed_at,
      assigned_by_name: subtask.assigned_by_name,
      assigned_by_email: subtask.assigned_by_email,
      assigned_to_name: subtask.assigned_to_name,
      assigned_to_email: subtask.assigned_to_email,
      assignment_type: subtask.assignment_type || 'individual',
      is_multi_assign: true,
      is_subtask: true,
      shared_with: [],
    }
  } catch {
    return {
      ...subtask,
      subtitle: subtask.subtitle || '',
      file_keys: [],
      comment_file_keys: [],
      shared_with: [],
      assignment_type: subtask.assignment_type || 'individual',
      is_multi_assign: true,
      is_subtask: true,
      created_at: subtask.task_created_at || subtask.created_at,
    }
  }
}

