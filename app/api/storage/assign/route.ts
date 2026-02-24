import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { query, queryOne } from "@/lib/db/mysql"
import { toS3Key } from "@/lib/utils/s3Updates"

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

    if (!title || !title.trim()) {
      return NextResponse.json({ error: "업무 제목이 필요합니다" }, { status: 400 })
    }

    // Subtask 기반 다중 할당 모드 체크 (새로운 구조)
    const isSubtaskMode = subtasks && Array.isArray(subtasks) && subtasks.length > 0

    if (isSubtaskMode) {
      // 공동 할당 모드: 본인이 책임자가 되고 나머지 사람들에게 공통 과제 부여
      // assignmentType은 항상 'individual'
      const finalAssignmentType = 'individual'
      const s3_update_id_for_subtask = body.s3_update_id != null ? String(body.s3_update_id) : null

      // 메인 task의 담당자는 항상 작성자 본인 (책임자)
      const mainAssignedTo = decoded.id

      return await handleSubtaskAssignment(decoded.id, mainAssignedTo, title, priority, due_date, subtasks, mainContent, finalAssignmentType, s3_update_id_for_subtask)
    }

    // 기존 다중 할당 모드 체크 (하위 호환성)
    const isMultiAssign = assignments && Array.isArray(assignments) && assignments.length > 0

    if (isMultiAssign) {
      // 다중 할당 모드
      return await handleMultiAssignment(decoded.id, title, priority, due_date, assignments)
    } else {
      // 개별 할당: S3 출처면 기존 task 있으면 수정, 없으면 생성
      if (fileKeys !== undefined && !Array.isArray(fileKeys)) {
        return NextResponse.json({ error: "파일 키 목록이 올바른 형식이 아닙니다" }, { status: 400 })
      }

      let fileKeysForTask: string[] = Array.isArray(fileKeys) ? fileKeys : []

      if (s3_update_id) {
        const row = await queryOne(
          `SELECT file_name, bucket_name FROM s3_updates WHERE id = ?`,
          [s3_update_id]
        )
        if (row) {
          const r = row as { file_name: string; bucket_name?: string | null }
          const s3Key = toS3Key(r)
          const extraKeys = (Array.isArray(fileKeys) ? fileKeys : [])
            .filter((k) => typeof k === "string" && k.trim())
            .filter((k) => k !== s3Key)
          // presigned(s3_update) 파일은 task file_keys/첨부 목록에 넣지 않음 → 버킷 카드 다운로드로만 제공
          fileKeysForTask = extraKeys
        }

        // 해당 S3 건에 이미 연결된 task가 있으면 새로 만들지 않고 그 task 수정
        let existingTaskId: string | null = null
        try {
          const s3Row = await queryOne(
            `SELECT task_id FROM s3_updates WHERE id = ?`,
            [s3_update_id]
          ) as { task_id?: string | null } | null
          if (s3Row?.task_id) existingTaskId = String(s3Row.task_id)
        } catch {
          // task_id 컬럼 없으면 무시
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
      }

      const finalAssignedTo = assignedTo || decoded.id
      return await handleSingleAssignment(decoded.id, finalAssignedTo, title, content, priority, due_date, fileKeysForTask, "single", s3_update_id)
    }
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

// 개별 할당 처리 (기존 로직)
async function handleSingleAssignment(
  assignedById: string,
  assignedTo: string,
  title: string,
  content: string,
  priority: string,
  due_date: any,
  fileKeys: string[],
  assignmentType: string = 'single',
  s3UpdateId?: string | null
) {
  // 담당자 존재 확인
  const [assignedUser] = await query(
    "SELECT id, full_name, email FROM profiles WHERE id = ?",
    [assignedTo]
  )

  if (!assignedUser) {
    return NextResponse.json({ error: "담당자를 찾을 수 없습니다" }, { status: 404 })
  }

  // due_date 없을 때 s3_update 출처면 업로드일을 기본 마감일로 사용 (캘린더 표시용)
  let dueDateValue = due_date ? (due_date instanceof Date ? due_date.toISOString().split('T')[0] : due_date) : null
  if (!dueDateValue && s3UpdateId && typeof s3UpdateId === "string") {
    const s3Row = await queryOne(
      `SELECT upload_time, created_at FROM s3_updates WHERE id = ?`,
      [s3UpdateId]
    ) as { upload_time?: string | null; created_at?: string } | null
    if (s3Row) {
      const dateStr = s3Row.upload_time || s3Row.created_at
      if (dateStr) dueDateValue = new Date(dateStr).toISOString().split("T")[0]
    }
  }

  // Task assignment 생성
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

  if (s3UpdateId && typeof s3UpdateId === "string") {
    try {
      await query(
        `UPDATE s3_updates SET task_id = ? WHERE id = ?`,
        [taskId, s3UpdateId]
      )
    } catch {
      // task_id 컬럼이 없으면 무시 (기존 s3_updates 스키마 호환)
    }
    try {
      await query(
        `UPDATE s3_updates SET status = 'pending' WHERE id = ?`,
        [s3UpdateId]
      )
    } catch {
      // status 컬럼이 없으면 무시
    }
  }

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

// Subtask 기반 다중 할당 처리 (하나의 메인 task + 여러 subtask)
async function handleSubtaskAssignment(
  assignedById: string,
  mainAssignedTo: string,
  title: string,
  priority: string,
  due_date: any,
  subtaskBlocks: SubtaskBlock[],
  mainContent?: string,
  assignmentType: string = 'individual',
  s3UpdateId?: string | null
) {
  if (!subtaskBlocks || subtaskBlocks.length === 0) {
    return NextResponse.json({ error: "업무 블록이 필요합니다" }, { status: 400 })
  }

  // 모든 고유 담당자 추출 (subtasks용)
  const allAssignees = new Set<string>()
  subtaskBlocks.forEach(block => {
    block.assignedToList.forEach(userId => allAssignees.add(userId))
  })

  const assigneeIds = Array.from(allAssignees)

  // 메인 task 담당자도 확인 목록에 추가
  const allUserIds = [...assigneeIds]
  if (!allUserIds.includes(mainAssignedTo)) {
    allUserIds.push(mainAssignedTo)
  }

  // 모든 담당자 존재 확인
  const placeholders = allUserIds.map(() => '?').join(',')
  const users = await query(
    `SELECT id, full_name, email FROM profiles WHERE id IN (${placeholders})`,
    allUserIds
  )

  if (users.length !== allUserIds.length) {
    return NextResponse.json({ error: "일부 담당자를 찾을 수 없습니다" }, { status: 404 })
  }

  const usersMap = new Map(users.map((u: any) => [u.id, u]))

  // 메인 Task ID 생성 (하나만 생성)
  const taskId = crypto.randomUUID()
  const dueDateValue = due_date ? (due_date instanceof Date ? due_date.toISOString().split('T')[0] : due_date) : null
  
  // 메인 task 하나만 생성 (선택한 사용자에게 할당)
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

  // 각 subtask 블록의 각 담당자에게 subtask 생성
  const subtaskIds = []
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
      
      subtaskIds.push({
        subtaskId,
        assignedTo: usersMap.get(assigneeId)
      })
    }
  }

  // S3 건에서 공동 태스크로 넘긴 경우: 해당 S3에 메인 task 연결 → 워크리스트에서 ㄴ 형태로 표시
  if (s3UpdateId && typeof s3UpdateId === "string") {
    try {
      await query(
        `UPDATE s3_updates SET task_id = ? WHERE id = ?`,
        [taskId, s3UpdateId]
      )
    } catch {
      // task_id 컬럼 없으면 무시
    }
    try {
      await query(
        `UPDATE s3_updates SET status = 'pending' WHERE id = ?`,
        [s3UpdateId]
      )
    } catch {
      // status 컬럼 없으면 무시
    }
  }

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

