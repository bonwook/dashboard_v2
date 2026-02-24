import { type NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { verifyToken } from "@/lib/auth"
import { query } from "@/lib/db/mysql"
import { writeAuditLog } from "@/lib/db/audit"
import { toS3Key } from "@/lib/utils/s3Updates"
import { normalizeFileKeyArray } from "@/lib/utils/fileKeyHelpers"

/** 파일 키 배열에 대해 user_files의 uploaded_at을 한 번의 IN 쿼리로 조회 (같은 키 여러 행 시 최신만) */
async function getFileKeysWithDates(
  keys: string[]
): Promise<Array<{ key: string; uploaded_at: string | null }>> {
  if (keys.length === 0) return []
  const placeholders = keys.map(() => "?").join(",")
  const rows = await query<{ s3_key: string; uploaded_at: string | null }>(
    `SELECT s3_key, uploaded_at FROM user_files WHERE s3_key IN (${placeholders}) ORDER BY uploaded_at DESC`,
    keys
  )
  const map = new Map<string, string | null>()
  for (const r of rows) {
    if (!map.has(r.s3_key)) map.set(r.s3_key, r.uploaded_at)
  }
  return keys.map((key) => ({ key, uploaded_at: map.get(key) ?? null }))
}

/** task_file_attachments 테이블에서 task_id(, subtask_id) 기준 첨부 목록 조회. 실패 시 null */
async function getTaskAttachmentsFromTable(
  taskId: string,
  subtaskId: string | null
): Promise<{ file_keys: Array<{ key: string; uploaded_at: string | null }>; comment_file_keys: Array<{ key: string; uploaded_at: string | null }> } | null> {
  try {
    const condition = subtaskId
      ? "task_id = ? AND subtask_id = ?"
      : "task_id = ? AND (subtask_id IS NULL OR subtask_id = '')"
    const params = subtaskId ? [taskId, subtaskId] : [taskId]
    const rows = await query<{ s3_key: string; file_name: string | null; attachment_type: string; uploaded_at: string | null }>(
      `SELECT s3_key, file_name, attachment_type, uploaded_at FROM task_file_attachments WHERE ${condition} ORDER BY created_at ASC`,
      params
    )
    if (!rows || rows.length === 0) return null
    const fileKeys = rows.filter((r) => r.attachment_type === "requester").map((r) => ({ key: r.s3_key, uploaded_at: r.uploaded_at }))
    const commentFileKeys = rows.filter((r) => r.attachment_type === "assignee").map((r) => ({ key: r.s3_key, uploaded_at: r.uploaded_at }))
    return { file_keys: fileKeys, comment_file_keys: commentFileKeys }
  } catch (e: any) {
    if (e?.code === "ER_NO_SUCH_TABLE") return null
    throw e
  }
}

/** user_files에서 키별 최신 행의 uploaded_at, file_name 조회 */
async function getUserFilesMeta(
  keys: string[]
): Promise<Map<string, { uploaded_at: string | null; file_name: string | null }>> {
  if (keys.length === 0) return new Map()
  const placeholders = keys.map(() => "?").join(",")
  try {
    const rows = await query<{ s3_key: string; uploaded_at: string | null; file_name: string | null }>(
      `SELECT s3_key, uploaded_at, file_name FROM user_files WHERE s3_key IN (${placeholders}) ORDER BY uploaded_at DESC`,
      keys
    )
    const map = new Map<string, { uploaded_at: string | null; file_name: string | null }>()
    for (const r of rows) {
      if (!map.has(r.s3_key)) map.set(r.s3_key, { uploaded_at: r.uploaded_at, file_name: r.file_name })
    }
    return map
  } catch {
    return new Map()
  }
}

/**
 * task_file_attachments 동기화: 기존 행 삭제 후 키 목록으로 재등록.
 * uploaded_at은 user_files 최신 또는 NOW() 단, minUploadedAt보다 이전이 되지 않도록 함
 * (업무 생성일보다 과거로 찍히면 7일 만료가 이미 지나 만료로 표시되므로, 첨부 시점은 생성/수정 시점 이후로 유지)
 */
async function syncTaskFileAttachments(
  taskId: string,
  subtaskId: string | null,
  requesterKeys: string[],
  assigneeKeys: string[],
  minUploadedAt?: Date | null
): Promise<void> {
  try {
    const condition = subtaskId ? "task_id = ? AND subtask_id = ?" : "task_id = ? AND (subtask_id IS NULL OR subtask_id = '')"
    const params = subtaskId ? [taskId, subtaskId] : [taskId]
    await query(`DELETE FROM task_file_attachments WHERE ${condition}`, params)
  } catch (e: any) {
    if (e?.code === "ER_NO_SUCH_TABLE") return
    throw e
  }
  const allKeys = [...requesterKeys, ...assigneeKeys]
  const meta = await getUserFilesMeta(allKeys)
  const extractFileName = (k: string) => (k.split("/").pop() || null)
  const now = new Date()
  const floor = minUploadedAt && minUploadedAt.getTime() > 0 ? minUploadedAt : null
  const clampAt = (candidate: Date) => (floor && candidate.getTime() < floor.getTime() ? floor : candidate)
  for (const key of requesterKeys) {
    const { uploaded_at, file_name } = meta.get(key) ?? { uploaded_at: null, file_name: null }
    const at = clampAt(uploaded_at ? new Date(uploaded_at) : now)
    await query(
      `INSERT INTO task_file_attachments (id, task_id, subtask_id, s3_key, file_name, attachment_type, uploaded_at) VALUES (?, ?, ?, ?, ?, 'requester', ?)`,
      [randomUUID(), taskId, subtaskId ?? null, key, file_name ?? extractFileName(key), at]
    )
  }
  for (const key of assigneeKeys) {
    const { uploaded_at, file_name } = meta.get(key) ?? { uploaded_at: null, file_name: null }
    const at = clampAt(uploaded_at ? new Date(uploaded_at) : now)
    await query(
      `INSERT INTO task_file_attachments (id, task_id, subtask_id, s3_key, file_name, attachment_type, uploaded_at) VALUES (?, ?, ?, ?, ?, 'assignee', ?)`,
      [randomUUID(), taskId, subtaskId ?? null, key, file_name ?? extractFileName(key), at]
    )
  }
}

// GET /api/tasks/[id] - Task 또는 Subtask 상세 정보 조회
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

    // Next.js 15에서는 params가 Promise이므로 await 필요
    const { id } = await params
    const taskId = id

    // Check if user is admin or staff (can view all tasks)
    const userRoleRes = await query(
      `SELECT role FROM profiles WHERE id = ?`,
      [decoded.id]
    )

    const userRole = userRoleRes && userRoleRes.length > 0 ? userRoleRes[0].role : null
    const isAdminOrStaff = userRole === "admin" || userRole === "staff"

    // 먼저 메인 태스크 확인
    const mainTaskSql = `
      SELECT 
        ta.*,
        ta.assignment_type,
        p_assigned_by.full_name as assigned_by_name,
        p_assigned_by.email as assigned_by_email,
        p_assigned_to.full_name as assigned_to_name,
        p_assigned_to.email as assigned_to_email
      FROM task_assignments ta
      LEFT JOIN profiles p_assigned_by ON ta.assigned_by = p_assigned_by.id
      LEFT JOIN profiles p_assigned_to ON ta.assigned_to = p_assigned_to.id
      WHERE ta.id = ?
    `

    const mainTasks = await query(mainTaskSql, [taskId])

    if (mainTasks && mainTasks.length > 0) {
      const task = mainTasks[0]

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

      // s3Update는 한 번만 조회 (정상/에러 응답 공통)
      let s3Update: Record<string, unknown> | null = null
      try {
        const s3Rows = await query(
          `SELECT id, file_name, bucket_name, file_size, upload_time, created_at, task_id FROM s3_updates WHERE task_id = ? LIMIT 1`,
          [taskId]
        )
        if (s3Rows && s3Rows.length > 0) {
          const r = s3Rows[0] as { file_name: string; bucket_name?: string | null }
          s3Update = { ...s3Rows[0], s3_key: toS3Key(r) }
        }
      } catch {
        // s3_updates 없거나 컬럼 없으면 무시
      }

      // file_keys, comment_file_keys: task_file_attachments 우선, 없으면 기존 JSON + user_files
      try {
        const fromTable = await getTaskAttachmentsFromTable(taskId, null)
        let fileKeysWithDates: Array<{ key: string; uploaded_at: string | null }>
        let commentFileKeysWithDates: Array<{ key: string; uploaded_at: string | null }>
        if (fromTable && (fromTable.file_keys.length > 0 || fromTable.comment_file_keys.length > 0)) {
          fileKeysWithDates = fromTable.file_keys
          commentFileKeysWithDates = fromTable.comment_file_keys
        } else {
          const rawFileKeys = typeof task.file_keys === "string" ? JSON.parse(task.file_keys) : task.file_keys ?? []
          const rawCommentFileKeys = typeof task.comment_file_keys === "string" ? JSON.parse(task.comment_file_keys) : task.comment_file_keys ?? []
          const fileKeys = normalizeFileKeyArray(rawFileKeys)
          const commentFileKeys = normalizeFileKeyArray(rawCommentFileKeys)
          const [fk, cfk] = await Promise.all([
            getFileKeysWithDates(fileKeys),
            getFileKeysWithDates(commentFileKeys),
          ])
          fileKeysWithDates = fk
          commentFileKeysWithDates = cfk
          // 백필: 다음 조회부터 task_file_attachments 사용 (uploaded_at은 업무 생성일 이전이 되지 않도록)
          if (fileKeys.length > 0 || commentFileKeys.length > 0) {
            try {
              const taskCreatedAt = task.created_at ? new Date(task.created_at) : null
              await syncTaskFileAttachments(taskId, null, fileKeys, commentFileKeys, taskCreatedAt)
            } catch {
              // 테이블 없거나 실패 시 무시
            }
          }
        }
        // s3_update(presigned) 파일은 요청자 첨부 목록에서 제외 → 버킷 카드 다운로드로만 제공
        const s3Key = s3Update && typeof (s3Update as { s3_key?: string }).s3_key === "string" ? (s3Update as { s3_key: string }).s3_key : null
        const filteredFileKeys = s3Key ? fileKeysWithDates.filter((f) => f.key !== s3Key) : fileKeysWithDates
        return NextResponse.json({
          task: {
            ...task,
            file_keys: filteredFileKeys,
            comment_file_keys: commentFileKeysWithDates,
            shared_with: [],
          },
          ...(s3Update ? { s3Update } : {}),
        })
      } catch {
        return NextResponse.json({
          task: {
            ...task,
            file_keys: [],
            comment_file_keys: [],
            shared_with: [],
          },
          ...(s3Update ? { s3Update } : {}),
        })
      }
    }

    // 서브태스크 확인
    const subtaskSql = `
      SELECT 
        ts.*,
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
      INNER JOIN task_assignments ta ON ts.task_id = ta.id
      LEFT JOIN profiles p_assigned_by ON ta.assigned_by = p_assigned_by.id
      LEFT JOIN profiles p_assigned_to ON ts.assigned_to = p_assigned_to.id
      WHERE ts.id = ?
    `

    const subtasks = await query(subtaskSql, [taskId])

    if (subtasks && subtasks.length > 0) {
      const subtask = subtasks[0]

      // 권한 확인: admin/staff는 모든 subtask 조회 가능, 그 외는 자신의 subtask만
      if (!isAdminOrStaff && subtask.assigned_to !== decoded.id && subtask.assigned_by !== decoded.id) {
        return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })
      }

      // file_keys, comment_file_keys: task_file_attachments(세부업무) 우선
      try {
        const fromTable = await getTaskAttachmentsFromTable(subtask.task_id, subtask.id)
        let fileKeysWithDates: Array<{ key: string; uploaded_at: string | null }>
        let commentFileKeysWithDates: Array<{ key: string; uploaded_at: string | null }>
        if (fromTable && (fromTable.file_keys.length > 0 || fromTable.comment_file_keys.length > 0)) {
          fileKeysWithDates = fromTable.file_keys
          commentFileKeysWithDates = fromTable.comment_file_keys
        } else {
          const rawFileKeys = typeof subtask.file_keys === "string" ? JSON.parse(subtask.file_keys) : subtask.file_keys ?? []
          const rawCommentFileKeys = typeof subtask.comment_file_keys === "string" ? JSON.parse(subtask.comment_file_keys) : subtask.comment_file_keys ?? []
          const fileKeys = normalizeFileKeyArray(rawFileKeys)
          const commentFileKeys = normalizeFileKeyArray(rawCommentFileKeys)
          const [fk, cfk] = await Promise.all([
            getFileKeysWithDates(fileKeys),
            getFileKeysWithDates(commentFileKeys),
          ])
          fileKeysWithDates = fk
          commentFileKeysWithDates = cfk
          if (fileKeys.length > 0 || commentFileKeys.length > 0) {
            try {
              const subCreatedAt = subtask.created_at ? new Date(subtask.created_at) : null
              await syncTaskFileAttachments(subtask.task_id, subtask.id, fileKeys, commentFileKeys, subCreatedAt)
            } catch {
              // ignore
            }
          }
        }
        return NextResponse.json({
          task: {
            id: subtask.id,
            task_id: subtask.task_id,
            subtitle: subtask.subtitle,
            assigned_to: subtask.assigned_to,
            assigned_by: subtask.assigned_by,
            title: subtask.title,
            content: subtask.content,
            priority: subtask.priority,
            status: subtask.status,
            due_date: subtask.due_date,
            file_keys: fileKeysWithDates,
            comment: subtask.comment,
            comment_file_keys: commentFileKeysWithDates,
            created_at: subtask.task_created_at || subtask.created_at,
            updated_at: subtask.updated_at,
            completed_at: subtask.completed_at,
            assigned_by_name: subtask.assigned_by_name,
            assigned_by_email: subtask.assigned_by_email,
            assigned_to_name: subtask.assigned_to_name,
            assigned_to_email: subtask.assigned_to_email,
            assignment_type: subtask.assignment_type,
            is_subtask: true,
            shared_with: [],
          }
        })
      } catch {
        return NextResponse.json({
          task: {
            ...subtask,
            file_keys: [],
            comment_file_keys: [],
            assignment_type: subtask.assignment_type,
            is_subtask: true,
            shared_with: [],
          }
        })
      }
    }

    return NextResponse.json({ error: "Task를 찾을 수 없습니다" }, { status: 404 })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

// PATCH /api/tasks/[id] - Task 또는 Subtask 상태 업데이트
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

    // Next.js 15에서는 params가 Promise이므로 await 필요
    const { id } = await params
    const taskId = id
    const body = await request.json()
    const { status, description, content, file_keys, comment, comment_file_keys, due_date, is_subtask, title } = body

    // Subtask인 경우 (명시적으로 is_subtask가 true인 경우)
    if (is_subtask) {
      return await handleSubtaskUpdate(taskId, decoded.id, body, request)
    }

    // 먼저 메인 Task가 존재하는지 확인
    const taskResult = await query(
      "SELECT id, assigned_to, assigned_by, status as current_status, due_date as current_due_date FROM task_assignments WHERE id = ?",
      [taskId]
    )
    const task = taskResult && taskResult.length > 0 ? taskResult[0] : null

    // 메인 Task가 없으면 Subtask 확인
    if (!task) {
      const subtaskResult = await query(
        "SELECT id, task_id, assigned_to, status as current_status FROM task_subtasks WHERE id = ?",
        [taskId]
      )
      const subtask = subtaskResult && subtaskResult.length > 0 ? subtaskResult[0] : null
      
      if (subtask) {
        // Subtask로 처리
        return await handleSubtaskUpdate(taskId, decoded.id, body, request)
      }
      
      // 둘 다 없으면 404
      return NextResponse.json({ error: "Task를 찾을 수 없습니다" }, { status: 404 })
    }

    // 메인 Task 처리

    // 사용자 역할 확인
    const userRoleRes = await query(
      `SELECT role FROM profiles WHERE id = ?`,
      [decoded.id]
    )
    const userRole = userRoleRes && userRoleRes.length > 0 ? userRoleRes[0].role : null
    const isAdminOrStaff = userRole === "admin" || userRole === "staff"

    // due_date는 admin/staff는 모든 업무 수정 가능, 그 외는 요청자·담당자만 수정 가능
    if (due_date !== undefined) {
      if (!isAdminOrStaff) {
        const isAssigner = decoded.id === task.assigned_by
        const isAssignee = decoded.id === task.assigned_to
        if (!isAssigner && !isAssignee) {
          return NextResponse.json({ error: "마감일은 이 업무의 요청자·담당자 또는 관리자만 수정할 수 있습니다" }, { status: 403 })
        }
      }
    }

    // 담당자(assigned_to), staff/admin, 또는 요청자(assigned_by)만 메인 task 수정 가능
    // 요청자는 content, file_keys, due_date, title 만 수정 가능
    const isRequesterOnly = decoded.id === task.assigned_by && decoded.id !== task.assigned_to && !isAdminOrStaff
    const canEditAsAssigneeOrAdmin = task.assigned_to === decoded.id || isAdminOrStaff
    if (!canEditAsAssigneeOrAdmin && !isRequesterOnly) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })
    }

    const currentRequesterKeys = normalizeFileKeyArray(typeof task.file_keys === "string" ? JSON.parse(task.file_keys || "[]") : task.file_keys ?? [])
    const currentAssigneeKeys = normalizeFileKeyArray(typeof task.comment_file_keys === "string" ? JSON.parse(task.comment_file_keys || "[]") : task.comment_file_keys ?? [])
    let finalRequesterKeys: string[] | null = null
    let finalAssigneeKeys: string[] | null = null

    // 상태 업데이트 또는 description 업데이트
    const updateFields: string[] = ["updated_at = NOW()"]
    const updateParams: (string | null)[] = []
    let statusChanged = false
    let oldStatus = task.current_status
    let dueDateChanged = false
    const oldDueDate = task.current_due_date ?? null

    // 완료(completed) 상태인 작업은 마감일 변경 불가
    // (단, status를 completed가 아닌 상태로 변경하는 요청과 함께 오는 경우는 허용)
    const nextStatus = status !== undefined ? status : oldStatus
    if (due_date !== undefined && nextStatus === "completed") {
      return NextResponse.json({ error: "완료된 작업은 마감일을 변경할 수 없습니다" }, { status: 400 })
    }

    if (!isRequesterOnly && status !== undefined) {
      const validStatuses = ['pending', 'in_progress', 'on_hold', 'awaiting_completion', 'completed']
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: "유효하지 않은 상태입니다" }, { status: 400 })
      }

      // 작업끝내기(completed): 요청자(assigned_by) 또는 admin/staff 가능 (admin = staff 동일 취급)
      if (status === 'completed') {
        const isAssigner = decoded.id === task.assigned_by
        const isAdminOrStaff = userRole === 'admin' || userRole === 'staff'
        if (!isAssigner && !isAdminOrStaff) {
          return NextResponse.json(
            { error: "작업 끝내기는 요청자 또는 담당자(admin/staff)만 할 수 있습니다" },
            { status: 403 }
          )
        }
      }
      
      // 상태가 변경되었는지 확인
      if (oldStatus !== status) {
        statusChanged = true
      }
      
      updateFields.push("status = ?")
      updateParams.push(status)

      // 완료 상태로 변경 시 completed_at 설정
      if (status === 'completed') {
        updateFields.push("completed_at = NOW()")
      } else {
        updateFields.push("completed_at = NULL")
      }
    }

    if (!isRequesterOnly && description !== undefined) {
      updateFields.push("description = ?")
      updateParams.push(description)
    }

    if (content !== undefined) {
      updateFields.push("content = ?")
      updateParams.push(content || "")
    }

    if (file_keys !== undefined) {
      const rawFileKeys = Array.isArray(file_keys) ? file_keys : []
      const rawCommentKeys = Array.isArray(comment_file_keys) ? comment_file_keys : []
      const commentSet = new Set(rawCommentKeys.filter((k) => typeof k === "string" && k))

      // 이 task에 연결된 S3 presigned 키는 file_keys에 넣지 않음(버킷 카드에서만 다운로드)
      let presignedKey: string | null = null
      try {
        const s3Row = await query(
          "SELECT file_name, bucket_name FROM s3_updates WHERE task_id = ? LIMIT 1",
          [taskId]
        )
        if (s3Row && s3Row.length > 0) {
          presignedKey = toS3Key(s3Row[0] as { file_name: string; bucket_name?: string | null })
        }
      } catch {
        // s3_updates 없거나 컬럼 없으면 무시
      }

      // file_keys 중복 제거 + comment_file_keys와 겹치는 키 제거 + presigned 키 제외
      const deduped: string[] = []
      const seen = new Set<string>()
      for (const k of rawFileKeys) {
        const key = typeof k === "string" ? k : ""
        if (!key) continue
        if (presignedKey && key === presignedKey) continue
        if (commentSet.has(key)) continue
        if (seen.has(key)) continue
        seen.add(key)
        deduped.push(key)
      }
      finalRequesterKeys = deduped

      const fileKeysJson = JSON.stringify(deduped)
      updateFields.push("file_keys = ?")
      updateParams.push(fileKeysJson)
    }

    if (!isRequesterOnly && comment !== undefined) {
      // comment는 첫 줄에 개행을 포함하여 저장
      const commentWithNewline = comment ? `\n${comment}` : null
      updateFields.push("comment = ?")
      updateParams.push(commentWithNewline)
    }

    if (!isRequesterOnly && comment_file_keys !== undefined) {
      // Comment 첨부파일 여러 개 허용. 중복 제거만 수행.
      const raw = Array.isArray(comment_file_keys) ? comment_file_keys : []
      const dedupedComment: string[] = []
      const seen = new Set<string>()
      for (const k of raw) {
        const key = typeof k === "string" ? k : ""
        if (!key) continue
        if (seen.has(key)) continue
        seen.add(key)
        dedupedComment.push(key)
      }
      finalAssigneeKeys = dedupedComment
      const commentFileKeysJson = JSON.stringify(dedupedComment)
      updateFields.push("comment_file_keys = ?")
      updateParams.push(commentFileKeysJson)
    }

    if (due_date !== undefined) {
      const dueDateValue = due_date ? (due_date instanceof Date ? due_date.toISOString().split('T')[0] : due_date) : null
      updateFields.push("due_date = ?")
      updateParams.push(dueDateValue)
      if ((oldDueDate ?? null) !== (dueDateValue ?? null)) {
        dueDateChanged = true
      }
    }

    if (title !== undefined) {
      updateFields.push("title = ?")
      updateParams.push(typeof title === "string" ? title : "")
    }

    if (updateFields.length === 1) {
      return NextResponse.json({ error: "업데이트할 필드가 없습니다" }, { status: 400 })
    }

    // task_assignments 테이블에 반영 (status 포함 시 DB에 즉시 저장)
    await query(
      `UPDATE task_assignments SET ${updateFields.join(", ")} WHERE id = ?`,
      [...updateParams, taskId]
    )

    // task_file_attachments 동기화 (저장 시점을 최소값으로 두어 7일 만료가 저장 시점부터 적용되도록)
    const requesterKeys = finalRequesterKeys !== null ? finalRequesterKeys : currentRequesterKeys
    const assigneeKeys = finalAssigneeKeys !== null ? finalAssigneeKeys : currentAssigneeKeys
    try {
      await syncTaskFileAttachments(taskId, null, requesterKeys, assigneeKeys, new Date())
    } catch {
      // 테이블 없거나 실패 시 무시
    }

    // task 상태 변경 시 연결된 s3_updates.status 동기화
    if (statusChanged && status !== undefined) {
      try {
        await query(
          `UPDATE s3_updates SET status = ? WHERE task_id = ?`,
          [status, taskId]
        )
      } catch {
        // s3_updates.status 컬럼 없으면 무시
      }
    }

    // 상태가 변경된 경우 task_status_history에 기록
    if (statusChanged && status !== undefined) {
      const historyId = randomUUID()
      await query(
        `INSERT INTO task_status_history (id, task_id, status, changed_by, changed_at) 
         VALUES (?, ?, ?, ?, NOW())`,
        [historyId, taskId, status, decoded.id]
      )

      await writeAuditLog({
        request,
        userId: decoded.id,
        action: "task.status_changed",
        taskId,
        details: { from: oldStatus, to: status },
      })

      // 메인 task 완료 시: 해당 task의 모든 서브태스크를 completed로 통일 (다른 담당자 task도 함께 완료 처리)
      if (status === "completed") {
        const subtasksResult = await query(
          `SELECT id FROM task_subtasks WHERE task_id = ? AND status != 'completed'`,
          [taskId]
        )
        if (subtasksResult && subtasksResult.length > 0) {
          await query(
            `UPDATE task_subtasks 
             SET status = 'completed', completed_at = NOW(), updated_at = NOW() 
             WHERE task_id = ? AND status != 'completed'`,
            [taskId]
          )
          for (const subtask of subtasksResult) {
            const subtaskHistoryId = randomUUID()
            await query(
              `INSERT INTO task_status_history (id, task_id, status, changed_by, changed_at) 
               VALUES (?, ?, ?, ?, NOW())`,
              [subtaskHistoryId, taskId, 'completed', decoded.id]
            )
          }
        }
      } else {
        // 완료가 아닌 상태로 변경 시: 본인 담당 subtask만 동일 상태로 갱신
        const mySubtasks = await query(
          `SELECT id FROM task_subtasks WHERE task_id = ? AND assigned_to = ?`,
          [taskId, decoded.id]
        )
        if (mySubtasks && mySubtasks.length > 0) {
          await query(
            `UPDATE task_subtasks SET status = ?, completed_at = NULL, updated_at = NOW() WHERE task_id = ? AND assigned_to = ?`,
            [status, taskId, decoded.id]
          )
        }
      }
    }

    if (dueDateChanged) {
      const dueDateValue = due_date ? (due_date instanceof Date ? due_date.toISOString().split('T')[0] : due_date) : null
      await writeAuditLog({
        request,
        userId: decoded.id,
        action: "task.due_date_changed",
        taskId,
        details: { from: oldDueDate, to: dueDateValue },
      })
    }

    return NextResponse.json({
      success: true,
      message: "Task가 업데이트되었습니다",
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

// Subtask 업데이트 처리
async function handleSubtaskUpdate(
  subtaskId: string,
  userId: string,
  body: any,
  request: NextRequest
) {
  const { status, content, file_keys, comment, comment_file_keys } = body

  // Subtask 확인
  const [subtask] = await query(
    "SELECT id, task_id, assigned_to, status as current_status, file_keys, comment_file_keys FROM task_subtasks WHERE id = ?",
    [subtaskId]
  )

  if (!subtask) {
    return NextResponse.json({ error: "Subtask를 찾을 수 없습니다" }, { status: 404 })
  }

  const currentSubtaskRequester = normalizeFileKeyArray(typeof subtask.file_keys === "string" ? JSON.parse(subtask.file_keys || "[]") : subtask.file_keys ?? [])
  const currentSubtaskAssignee = normalizeFileKeyArray(typeof subtask.comment_file_keys === "string" ? JSON.parse(subtask.comment_file_keys || "[]") : subtask.comment_file_keys ?? [])
  let finalSubtaskRequester: string[] | null = null
  let finalSubtaskAssignee: string[] | null = null

  // 사용자 역할 확인
  const userRoleRes = await query(
    `SELECT role FROM profiles WHERE id = ?`,
    [userId]
  )
  const userRole = userRoleRes && userRoleRes.length > 0 ? userRoleRes[0].role : null
  const isAdminOrStaff = userRole === "admin" || userRole === "staff"

  // 메인 task 요청자(assigned_by) 확인 - 요청자는 서브태스크 요청자 내용(content) 수정 가능
  const parentTaskRes = await query(
    "SELECT assigned_by FROM task_assignments WHERE id = ?",
    [subtask.task_id]
  )
  const parentAssignedBy = parentTaskRes && parentTaskRes.length > 0 ? (parentTaskRes[0] as { assigned_by: string }).assigned_by : null

  const canEditAsAssignee = subtask.assigned_to === userId
  const canEditAsRequester = parentAssignedBy === userId

  if (!canEditAsAssignee && !canEditAsRequester && !isAdminOrStaff) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })
  }

  const updateFields: string[] = ["updated_at = NOW()"]
  const updateParams: (string | null)[] = []
  let statusChanged = false
  const oldStatus = subtask.current_status

  if (status !== undefined) {
    const validStatuses = ['pending', 'in_progress', 'on_hold', 'awaiting_completion', 'completed']
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "유효하지 않은 상태입니다" }, { status: 400 })
    }
    
    if (oldStatus !== status) {
      statusChanged = true
    }
    
    updateFields.push("status = ?")
    updateParams.push(status)

    if (status === 'completed') {
      updateFields.push("completed_at = NOW()")
    } else {
      updateFields.push("completed_at = NULL")
    }
  }

  if (content !== undefined) {
    updateFields.push("content = ?")
    updateParams.push(content || "")
  }

  if (file_keys !== undefined) {
    const rawFileKeys = Array.isArray(file_keys) ? file_keys : []
    const rawCommentKeys = Array.isArray(comment_file_keys) ? comment_file_keys : []
    const commentSet = new Set(rawCommentKeys.filter((k) => typeof k === "string" && k))

    // 메인 task에 연결된 S3 presigned 키는 file_keys에 넣지 않음
    let presignedKey: string | null = null
    try {
      const s3Row = await query(
        "SELECT file_name, bucket_name FROM s3_updates WHERE task_id = ? LIMIT 1",
        [subtask.task_id]
      )
      if (s3Row && s3Row.length > 0) {
        presignedKey = toS3Key(s3Row[0] as { file_name: string; bucket_name?: string | null })
      }
    } catch {
      // ignore
    }

    const deduped: string[] = []
    const seen = new Set<string>()
    for (const k of rawFileKeys) {
      const key = typeof k === "string" ? k : ""
      if (!key) continue
      if (presignedKey && key === presignedKey) continue
      if (commentSet.has(key)) continue
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(key)
    }
    finalSubtaskRequester = deduped
    const fileKeysJson = JSON.stringify(deduped)
    updateFields.push("file_keys = ?")
    updateParams.push(fileKeysJson)
  }

  if (comment !== undefined) {
    const commentWithNewline = comment ? `\n${comment}` : null
    updateFields.push("comment = ?")
    updateParams.push(commentWithNewline)
  }

  if (comment_file_keys !== undefined) {
    const raw = Array.isArray(comment_file_keys) ? comment_file_keys : []
    const dedupedSubComment: string[] = []
    const seen = new Set<string>()
    for (const k of raw) {
      const key = typeof k === "string" ? k : ""
      if (!key) continue
      if (seen.has(key)) continue
      seen.add(key)
      dedupedSubComment.push(key)
    }
    finalSubtaskAssignee = dedupedSubComment
    const commentFileKeysJson = JSON.stringify(dedupedSubComment)
    updateFields.push("comment_file_keys = ?")
    updateParams.push(commentFileKeysJson)
  }

  if (updateFields.length === 1) {
    return NextResponse.json({ error: "업데이트할 필드가 없습니다" }, { status: 400 })
  }

  // Subtask 업데이트
  await query(
    `UPDATE task_subtasks SET ${updateFields.join(", ")} WHERE id = ?`,
    [...updateParams, subtaskId]
  )

  const subRequester = finalSubtaskRequester !== null ? finalSubtaskRequester : currentSubtaskRequester
  const subAssignee = finalSubtaskAssignee !== null ? finalSubtaskAssignee : currentSubtaskAssignee
  try {
    await syncTaskFileAttachments(subtask.task_id, subtaskId, subRequester, subAssignee, new Date())
  } catch {
    // ignore
  }

  // 상태가 변경된 경우 task_status_history에 기록
  if (statusChanged && status !== undefined) {
    const historyId = randomUUID()
    await query(
      `INSERT INTO task_status_history (id, task_id, status, changed_by, changed_at) 
       VALUES (?, ?, ?, ?, NOW())`,
      [historyId, subtask.task_id, status, userId]
    )

    await writeAuditLog({
      request,
      userId,
      action: "subtask.status_changed",
      taskId: subtask.task_id,
      details: { subtaskId, from: oldStatus, to: status },
    })
  }

  return NextResponse.json({
    success: true,
    message: "Subtask가 업데이트되었습니다",
  })
}

// DELETE /api/tasks/[id] - Task 삭제 (CASCADE 삭제 포함)
export async function DELETE(
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

    // Next.js 15에서는 params가 Promise이므로 await 필요
    const { id } = await params
    const taskId = id

    // 사용자 역할 확인
    const userRoleRes = await query(
      `SELECT role FROM profiles WHERE id = ?`,
      [decoded.id]
    )
    const userRole = userRoleRes && userRoleRes.length > 0 ? userRoleRes[0].role : null
    const isAdminOrStaff = userRole === "admin" || userRole === "staff"

    // 먼저 메인 Task가 존재하는지 확인
    const taskResult = await query(
      "SELECT id, assigned_to, status FROM task_assignments WHERE id = ?",
      [taskId]
    )
    const task = taskResult && taskResult.length > 0 ? taskResult[0] : null

    if (task) {
      // 권한 확인: admin/staff는 모든 task 삭제 가능, 그 외는 자신의 task만
      if (!isAdminOrStaff && task.assigned_to !== decoded.id) {
        return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })
      }
    } else {
      // 서브태스크 확인
      const subtaskResult = await query(
        "SELECT id, task_id, assigned_to FROM task_subtasks WHERE id = ?",
        [taskId]
      )
      const subtask = subtaskResult && subtaskResult.length > 0 ? subtaskResult[0] : null
      
      if (!subtask) {
        return NextResponse.json({ error: "Task를 찾을 수 없습니다" }, { status: 404 })
      }

      // 서브태스크 권한 확인
      if (!isAdminOrStaff && subtask.assigned_to !== decoded.id) {
        return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })
      }

      // 서브태스크 삭제
      await query("DELETE FROM task_subtasks WHERE id = ?", [taskId])
      
      // 감사 로그 기록
      await writeAuditLog({
        request,
        userId: decoded.id,
        action: "subtask.deleted",
        taskId: subtask.task_id,
        details: { subtaskId: taskId },
      })

      return NextResponse.json({
        success: true,
        message: "Subtask가 삭제되었습니다",
      })
    }

    // 관련 데이터 명시적 삭제 (CASCADE가 설정되어 있어도 명시적으로 삭제)
    
    // 안전한 삭제 헬퍼 함수
    const safeDelete = async (tableName: string, condition: string, params: any[]) => {
      try {
        const result = await query(`DELETE FROM ${tableName} WHERE ${condition}`, params)
        return result
      } catch (error: any) {
        // 테이블이 없는 경우 무시
        if (error.code !== 'ER_NO_SUCH_TABLE') {
          throw error
        }
      }
    }
    
    // 1. 댓글 삭제
    await safeDelete("task_comments", "task_id = ?", [taskId])
    
    // 2. 상태 변경 이력 삭제
    await safeDelete("task_status_history", "task_id = ?", [taskId])
    
    // 3. 공유 관계 삭제
    await safeDelete("task_shared_with", "task_id = ?", [taskId])
    
    // 4. 파일 첨부 삭제
    await safeDelete("task_file_attachments", "task_id = ?", [taskId])
    
    // 5. 세부 업무 삭제 (먼저 세부 업무의 파일 첨부 삭제)
    try {
      const subtasks = await query("SELECT id FROM task_subtasks WHERE task_id = ?", [taskId])
      for (const subtask of subtasks) {
        await safeDelete("task_file_attachments", "subtask_id = ?", [subtask.id])
      }
      await safeDelete("task_subtasks", "task_id = ?", [taskId])
    } catch (error: any) {
      if (error.code !== 'ER_NO_SUCH_TABLE') {
        throw error
      }
    }
    
    // 5.5. 이 task에 연결된 s3_updates 해제: task_id NULL, status pending (FK ON DELETE SET NULL도 있지만 명시적으로 처리)
    try {
      await query("UPDATE s3_updates SET task_id = NULL, status = 'pending' WHERE task_id = ?", [taskId])
    } catch (error: any) {
      if (error.code !== 'ER_BAD_FIELD_ERROR') throw error
      // status 컬럼 없으면 무시
    }
    
    // 6. 메인 Task 삭제
    await query("DELETE FROM task_assignments WHERE id = ?", [taskId])

    // 감사 로그 기록
    await writeAuditLog({
      request,
      userId: decoded.id,
      action: "task.deleted",
      taskId,
      details: { status: task.status },
    })

    return NextResponse.json({
      success: true,
      message: "Task와 모든 관련 데이터가 삭제되었습니다",
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

