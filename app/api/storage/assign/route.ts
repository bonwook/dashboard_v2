import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { query, queryOne } from "@/lib/db/mysql"
import { toS3Key } from "@/lib/utils/s3Updates"
import { linkS3UpdatesToTask } from "@/lib/taskS3Link"

interface AssignmentItem {
  assignedTo: string
  content?: string
  fileKeys?: string[]
}

interface SubtaskBlock {
  subtitle: string
  assignedToList: string[]
  content: string
  fileKeys: string[]
}

// POST /api/storage/assign - 파일 업무 등록 (개별 또는 다중 할당 지원)
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

    const body = await request.json()
    const { fileKeys, assignedTo, title, content, priority, due_date, assignments, subtasks, mainContent, noMainTask, assignmentType } = body
    const s3_update_id = body.s3_update_id != null ? String(body.s3_update_id) : null
    const s3_update_ids = Array.isArray(body.s3_update_ids)
      ? (body.s3_update_ids as unknown[]).map((id) => String(id)).filter((id) => id.trim())
      : []

    const s3Ids = s3_update_ids.length > 0 ? s3_update_ids : (s3_update_id ? [s3_update_id] : [])

    if (!title || !title.trim()) {
      return NextResponse.json({ error: "업무 제목이 필요합니다" }, { status: 400 })
    }

    // Subtask 기반 다중 할당 모드 체크 (새로운 구조)
    const isSubtaskMode = subtasks && Array.isArray(subtasks) && subtasks.length > 0

    if (isSubtaskMode) {
      const finalAssignmentType = 'individual'
      const mainAssignedTo = decoded.id
      return await handleSubtaskAssignment(decoded.id, mainAssignedTo, title, priority, due_date, subtasks, mainContent, finalAssignmentType, s3Ids)
    }

    // 기존 다중 할당 모드 체크 (하위 호환성)
    const isMultiAssign = assignments && Array.isArray(assignments) && assignments.length > 0

    if (isMultiAssign) {
      return await handleMultiAssignment(decoded.id, title, priority, due_date, assignments)
    }

    // 개별 할당
    if (fileKeys !== undefined && !Array.isArray(fileKeys)) {
      return NextResponse.json({ error: "파일 키 목록이 올바른 형식이 아닙니다" }, { status: 400 })
    }

    let fileKeysForTask: string[] = Array.isArray(fileKeys) ? fileKeys : []

    if (s3Ids.length > 0) {
      const s3KeySet = new Set<string>()
      for (const id of s3Ids) {
        const row = await queryOne(
          `SELECT file_name, bucket_name FROM s3_updates WHERE id = ?`,
          [id]
        )
        if (row) {
          const r = row as { file_name: string; bucket_name?: string | null }
          s3KeySet.add(toS3Key(r))
        }
      }
      fileKeysForTask = (Array.isArray(fileKeys) ? fileKeys : [])
        .filter((k) => typeof k === "string" && k.trim())
        .filter((k) => !s3KeySet.has(k))
    }

    if (s3Ids.length === 1) {
      let existingTaskId: string | null = null
      try {
        const s3Row = await queryOne(
          `SELECT task_id FROM s3_updates WHERE id = ?`,
          [s3Ids[0]]
        ) as { task_id?: string | null } | null
        if (s3Row?.task_id) existingTaskId = String(s3Row.task_id)
      } catch {
        // ignore
      }
      if (existingTaskId) {
        const finalAssignedTo = assignedTo || decoded.id
        return await handleUpdateExistingTaskForS3(
          decoded.id,
          finalAssignedTo,
          title,
          content,
          priority,
          due_date,
          existingTaskId
        )
      }
    } else if (s3Ids.length > 1) {
      const alreadyLinked = await query(
        `SELECT id FROM s3_updates WHERE id IN (${s3Ids.map(() => "?").join(",")}) AND task_id IS NOT NULL AND task_id != ''`,
        s3Ids
      )
      if (Array.isArray(alreadyLinked) && alreadyLinked.length > 0) {
        return NextResponse.json(
          { error: "선택한 S3 건 중 이미 다른 업무에 연결된 건이 있습니다. 연결 해제 후 다시 시도하세요." },
          { status: 400 }
        )
      }
    }

    const finalAssignedTo = assignedTo || decoded.id
    return await handleSingleAssignment(decoded.id, finalAssignedTo, title, content, priority, due_date, fileKeysForTask, "single", s3Ids)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

// S3 건에 이미 연결된 task가 있을 때: 새 task 생성 없이 해당 task만 수정 (업무 추가 = 수정)
async function handleUpdateExistingTaskForS3(
  assignedById: string,
  assignedTo: string,
  title: string,
  content: string,
  priority: string,
  due_date: any,
  taskId: string
) {
  const [assignedUser] = await query(
    "SELECT id, full_name, email FROM profiles WHERE id = ?",
    [assignedTo]
  )
  if (!assignedUser) {
    return NextResponse.json({ error: "담당자를 찾을 수 없습니다" }, { status: 404 })
  }

  const dueDateValue = due_date != null ? (due_date instanceof Date ? due_date.toISOString().split("T")[0] : due_date) : null

  await query(
    `UPDATE task_assignments SET
      assigned_to = ?, title = ?, content = ?, priority = ?, due_date = ?, updated_at = NOW()
      WHERE id = ?`,
    [assignedTo, title, content || "", priority || "medium", dueDateValue, taskId]
  )

  return NextResponse.json({
    success: true,
    message: "업무가 수정되었습니다",
    taskId,
    results: [],
    assignedTo: {
      id: assignedUser.id,
      name: assignedUser.full_name,
      email: assignedUser.email,
    },
  })
}

// 개별 할당 처리 (기존 로직, s3UpdateIds 배열 지원)
async function handleSingleAssignment(
  assignedById: string,
  assignedTo: string,
  title: string,
  content: string,
  priority: string,
  due_date: any,
  fileKeys: string[],
  assignmentType: string = 'single',
  s3UpdateIds: string[] = []
) {
  const [assignedUser] = await query(
    "SELECT id, full_name, email FROM profiles WHERE id = ?",
    [assignedTo]
  )

  if (!assignedUser) {
    return NextResponse.json({ error: "담당자를 찾을 수 없습니다" }, { status: 404 })
  }

  let dueDateValue = due_date ? (due_date instanceof Date ? due_date.toISOString().split('T')[0] : due_date) : null
  if (!dueDateValue && s3UpdateIds.length > 0) {
    const firstId = s3UpdateIds[0]
    const s3Row = await queryOne(
      `SELECT upload_time, created_at FROM s3_updates WHERE id = ?`,
      [firstId]
    ) as { upload_time?: string | null; created_at?: string } | null
    if (s3Row) {
      const dateStr = s3Row.upload_time || s3Row.created_at
      if (dateStr) dueDateValue = new Date(dateStr).toISOString().split("T")[0]
    }
  }

  const taskId = crypto.randomUUID()
  const fileKeysArray = fileKeys && Array.isArray(fileKeys) ? fileKeys : []
  const fileKeysJson = JSON.stringify(fileKeysArray)
  const finalContent = content || ""

  const insertParams = dueDateValue
    ? [taskId, assignedTo, assignedById, title, finalContent, priority || 'medium', fileKeysJson, false, assignmentType, dueDateValue]
    : [taskId, assignedTo, assignedById, title, finalContent, priority || 'medium', fileKeysJson, false, assignmentType, null]

  await query(
    `INSERT INTO task_assignments (
      id, assigned_to, assigned_by, title, content, priority, status, file_keys, is_multi_assign, assignment_type, due_date, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, NOW(), NOW())`,
    insertParams
  )

  await linkS3UpdatesToTask(taskId, s3UpdateIds)

  const results = fileKeysArray.map((fileKey: string) => ({ fileKey, success: true }))
  const message = fileKeysArray.length > 0
    ? `${fileKeysArray.length}개 파일이 포함된 업무가 등록되었습니다`
    : "업무가 등록되었습니다"

  return NextResponse.json({
    success: true,
    message,
    taskId,
    results,
    assignedTo: {
      id: assignedUser.id,
      name: assignedUser.full_name,
      email: assignedUser.email,
    },
  })
}

// Subtask 기반 다중 할당 처리 (하나의 메인 task + 여러 subtask, s3UpdateIds 배열 지원)
async function handleSubtaskAssignment(
  assignedById: string,
  mainAssignedTo: string,
  title: string,
  priority: string,
  due_date: any,
  subtaskBlocks: SubtaskBlock[],
  mainContent?: string,
  assignmentType: string = 'individual',
  s3UpdateIds: string[] = []
) {
  if (!subtaskBlocks || subtaskBlocks.length === 0) {
    return NextResponse.json({ error: "업무 블록이 필요합니다" }, { status: 400 })
  }

  const allAssignees = new Set<string>()
  subtaskBlocks.forEach(block => {
    block.assignedToList.forEach(userId => allAssignees.add(userId))
  })
  const assigneeIds = Array.from(allAssignees)
  const allUserIds = [...assigneeIds]
  if (!allUserIds.includes(mainAssignedTo)) {
    allUserIds.push(mainAssignedTo)
  }

  const placeholders = allUserIds.map(() => '?').join(',')
  const users = await query(
    `SELECT id, full_name, email FROM profiles WHERE id IN (${placeholders})`,
    allUserIds
  )
  if (users.length !== allUserIds.length) {
    return NextResponse.json({ error: "일부 담당자를 찾을 수 없습니다" }, { status: 404 })
  }
  const usersMap = new Map(users.map((u: any) => [u.id, u]))

  const taskId = crypto.randomUUID()
  let dueDateValue = due_date ? (due_date instanceof Date ? due_date.toISOString().split('T')[0] : due_date) : null
  if (!dueDateValue && s3UpdateIds.length > 0) {
    const s3Row = await queryOne(
      `SELECT upload_time, created_at FROM s3_updates WHERE id = ?`,
      [s3UpdateIds[0]]
    ) as { upload_time?: string | null; created_at?: string } | null
    if (s3Row?.upload_time || s3Row?.created_at) {
      dueDateValue = new Date((s3Row.upload_time || s3Row.created_at) as string).toISOString().split("T")[0]
    }
  }

  const finalMainContent = mainContent || ''
  const insertParams = dueDateValue
    ? [taskId, mainAssignedTo, assignedById, title, finalMainContent, priority || 'medium', true, assignmentType, dueDateValue]
    : [taskId, mainAssignedTo, assignedById, title, finalMainContent, priority || 'medium', true, assignmentType, null]

  await query(
    `INSERT INTO task_assignments (
      id, assigned_to, assigned_by, title, content, priority, status, is_multi_assign, assignment_type, due_date, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, NOW(), NOW())`,
    insertParams
  )

  const subtaskIds: { subtaskId: string; assignedTo: any }[] = []
  for (const block of subtaskBlocks) {
    for (const assigneeId of block.assignedToList) {
      const subtaskId = crypto.randomUUID()
      const fileKeysJson = JSON.stringify(block.fileKeys || [])
      await query(
        `INSERT INTO task_subtasks (
          id, task_id, subtitle, assigned_to, content, file_keys, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
        [subtaskId, taskId, block.subtitle || '', assigneeId, block.content || '', fileKeysJson]
      )
      subtaskIds.push({ subtaskId, assignedTo: usersMap.get(assigneeId) })
    }
  }

  await linkS3UpdatesToTask(taskId, s3UpdateIds)

  return NextResponse.json({
    success: true,
    message: `메인 업무 1개가 등록되었고, ${subtaskBlocks.length}개의 상세 업무가 ${assigneeIds.length}명에게 할당되었습니다`,
    taskId,
    subtasks: subtaskIds,
    isMultiAssign: true
  })
}


// 다중 할당 처리 (기존 로직 - 하위 호환성)
async function handleMultiAssignment(
  assignedById: string,
  title: string,
  priority: string,
  due_date: any,
  assignments: AssignmentItem[]
) {
  if (!assignments || assignments.length === 0) {
    return NextResponse.json({ error: "할당 정보가 필요합니다" }, { status: 400 })
  }

  // 모든 담당자 존재 확인
  const assigneeIds = assignments.map(a => a.assignedTo)
  const placeholders = assigneeIds.map(() => '?').join(',')
  const users = await query(
    `SELECT id, full_name, email FROM profiles WHERE id IN (${placeholders})`,
    assigneeIds
  )

  if (users.length !== assigneeIds.length) {
    return NextResponse.json({ error: "일부 담당자를 찾을 수 없습니다" }, { status: 404 })
  }

  const usersMap = new Map(users.map((u: any) => [u.id, u]))

  // Task assignment 생성 (공통 정보)
  const taskId = crypto.randomUUID()
  const dueDateValue = due_date ? (due_date instanceof Date ? due_date.toISOString().split('T')[0] : due_date) : null
  
  const insertParams = dueDateValue
    ? [taskId, assignedById, assignedById, title, priority || 'medium', true, 'individual', dueDateValue]
    : [taskId, assignedById, assignedById, title, priority || 'medium', true, 'individual', null]

  await query(
    `INSERT INTO task_assignments (
      id, assigned_to, assigned_by, title, priority, status, is_multi_assign, assignment_type, due_date, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, NOW(), NOW())`,
    insertParams
  )

  // Subtasks 생성 (각 담당자별)
  const subtaskIds = []
  for (const assignment of assignments) {
    const subtaskId = crypto.randomUUID()
    const fileKeysJson = JSON.stringify(assignment.fileKeys || [])
    
    await query(
      `INSERT INTO task_subtasks (
        id, task_id, assigned_to, content, file_keys, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
      [subtaskId, taskId, assignment.assignedTo, assignment.content || '', fileKeysJson]
    )
    
    subtaskIds.push({
      subtaskId,
      assignedTo: usersMap.get(assignment.assignedTo)
    })
  }

  return NextResponse.json({
    success: true,
    message: `업무가 ${assignments.length}명의 담당자에게 분담 할당되었습니다`,
    taskId,
    subtasks: subtaskIds,
    isMultiAssign: true
  })
}

