import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { query } from "@/lib/db/mysql"
import { TASK_DATETIME_SQL, SUBTASK_DATETIME_SQL } from "@/lib/utils/taskDateHelpers"

// GET /api/tasks/calendar - 캘린더용 날짜별 task 조회
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

    // 사용자 역할 확인
    const [userRoleData] = await query(
      "SELECT role FROM profiles WHERE id = ?",
      [decoded.id]
    )
    const userRole = userRoleData?.role || null
    const isStaff = userRole === "admin" || userRole === "staff"

    const { searchParams } = new URL(request.url)
    const year = searchParams.get("year")
    const month = searchParams.get("month") // 1-12
    const assignedToMeOnly = searchParams.get("assignedToMeOnly") === "true"

    if (!year || !month) {
      return NextResponse.json({ error: "year and month are required" }, { status: 400 })
    }

    const userId = decoded.id
    
    let sql = ''
    let params: any[] = []

    // 모든 태스크 조회 (완료/미완료 모두)
    if (isStaff) {
      if (assignedToMeOnly) {
        // Staff + 내 업무만: 본인 관련 태스크만 (개별 할당 + 공동할당 서브태스크 담당 포함)
        // 3번째 UNION: 서브태스크로만 할당된 메인 태스크(공동할당) — 본인이 서브태스크 담당이면 캘린더에 표시
        sql = `
          SELECT * FROM (
            SELECT
              ta.id,
              ta.title,
              ta.status,
              ta.priority,
              ta.assigned_by,
              ta.assigned_to,
              ta.content,
              ta.file_keys,
              ta.due_date,
              ta.created_at,
              ta.updated_at,
              ta.completed_at,
              (${TASK_DATETIME_SQL('ta')}) as task_datetime,
              CASE WHEN ta.assigned_by = ? THEN 'assigned' WHEN ta.assigned_to = ? THEN 'received' ELSE 'received' END as task_type,
              p_assigned_to.full_name as assigned_to_name,
              p_assigned_to.email as assigned_to_email,
              p_assigned_by.full_name as assigned_by_name,
              p_assigned_by.email as assigned_by_email,
              FALSE as is_subtask,
              NULL as parent_task_id,
              NULL as subtitle
            FROM task_assignments ta
            LEFT JOIN profiles p_assigned_to ON ta.assigned_to = p_assigned_to.id
            LEFT JOIN profiles p_assigned_by ON ta.assigned_by = p_assigned_by.id
            WHERE (ta.assigned_by = ? OR ta.assigned_to = ?)
            
            UNION ALL
            
            SELECT
              ts.id,
              CONCAT(ta.title, ' - ', ts.subtitle) as title,
              ts.status,
              ta.priority,
              ta.assigned_by,
              ts.assigned_to,
              ts.content,
              ts.file_keys,
              ta.due_date,
              ts.created_at,
              ts.updated_at,
              ts.completed_at,
              (${SUBTASK_DATETIME_SQL('ts', 'ta')}) as task_datetime,
              'received' as task_type,
              p_assigned_to.full_name as assigned_to_name,
              p_assigned_to.email as assigned_to_email,
              p_assigned_by.full_name as assigned_by_name,
              p_assigned_by.email as assigned_by_email,
              TRUE as is_subtask,
              ts.task_id as parent_task_id,
              ts.subtitle
            FROM task_subtasks ts
            INNER JOIN task_assignments ta ON ts.task_id = ta.id
            LEFT JOIN profiles p_assigned_to ON ts.assigned_to = p_assigned_to.id
            LEFT JOIN profiles p_assigned_by ON ta.assigned_by = p_assigned_by.id
            WHERE (ta.assigned_by = ? OR ts.assigned_to = ?)
            
            UNION ALL
            
            SELECT
              ta.id,
              ta.title,
              (SELECT ts_ref.status FROM task_subtasks ts_ref WHERE ts_ref.task_id = ta.id AND ts_ref.assigned_to = ? LIMIT 1) as status,
              ta.priority,
              ta.assigned_by,
              ta.assigned_to,
              ta.content,
              ta.file_keys,
              ta.due_date,
              ta.created_at,
              ta.updated_at,
              ta.completed_at,
              (${TASK_DATETIME_SQL('ta')}) as task_datetime,
              'received' as task_type,
              p_assigned_to.full_name as assigned_to_name,
              p_assigned_to.email as assigned_to_email,
              p_assigned_by.full_name as assigned_by_name,
              p_assigned_by.email as assigned_by_email,
              FALSE as is_subtask,
              NULL as parent_task_id,
              NULL as subtitle
            FROM task_assignments ta
            LEFT JOIN profiles p_assigned_to ON ta.assigned_to = p_assigned_to.id
            LEFT JOIN profiles p_assigned_by ON ta.assigned_by = p_assigned_by.id
            WHERE ta.id IN (SELECT task_id FROM task_subtasks WHERE assigned_to = ?)
              AND ta.assigned_by != ?
              AND (ta.assigned_to IS NULL OR ta.assigned_to != ?)
          ) combined
        ORDER BY combined.task_datetime, combined.created_at DESC
        `
        params = [userId, userId, userId, userId, userId, userId, userId, userId, userId, userId]
      } else {
        // Staff + 전체: 모든 태스크 조회 (내 업무만 보기 OFF)
        sql = `
          SELECT * FROM (
            SELECT
              ta.id,
              ta.title,
              ta.status,
              ta.priority,
              ta.assigned_by,
              ta.assigned_to,
              ta.content,
              ta.file_keys,
              ta.due_date,
              ta.created_at,
              ta.updated_at,
              ta.completed_at,
              (${TASK_DATETIME_SQL('ta')}) as task_datetime,
              CASE WHEN ta.assigned_by = ? THEN 'assigned' WHEN ta.assigned_to = ? THEN 'received' ELSE 'received' END as task_type,
              p_assigned_to.full_name as assigned_to_name,
              p_assigned_to.email as assigned_to_email,
              p_assigned_by.full_name as assigned_by_name,
              p_assigned_by.email as assigned_by_email,
              FALSE as is_subtask,
              NULL as parent_task_id,
              NULL as subtitle
            FROM task_assignments ta
            LEFT JOIN profiles p_assigned_to ON ta.assigned_to = p_assigned_to.id
            LEFT JOIN profiles p_assigned_by ON ta.assigned_by = p_assigned_by.id
            
            UNION ALL
            
            SELECT
              ts.id,
              CONCAT(ta.title, ' - ', ts.subtitle) as title,
              ts.status,
              ta.priority,
              ta.assigned_by,
              ts.assigned_to,
              ts.content,
              ts.file_keys,
              ta.due_date,
              ts.created_at,
              ts.updated_at,
              ts.completed_at,
              (${SUBTASK_DATETIME_SQL('ts', 'ta')}) as task_datetime,
              CASE WHEN ta.assigned_by = ? THEN 'assigned' WHEN ts.assigned_to = ? THEN 'received' ELSE 'received' END as task_type,
              p_assigned_to.full_name as assigned_to_name,
              p_assigned_to.email as assigned_to_email,
              p_assigned_by.full_name as assigned_by_name,
              p_assigned_by.email as assigned_by_email,
              TRUE as is_subtask,
              ts.task_id as parent_task_id,
              ts.subtitle
            FROM task_subtasks ts
            INNER JOIN task_assignments ta ON ts.task_id = ta.id
            LEFT JOIN profiles p_assigned_to ON ts.assigned_to = p_assigned_to.id
            LEFT JOIN profiles p_assigned_by ON ta.assigned_by = p_assigned_by.id
          ) combined
          ORDER BY combined.task_datetime, combined.created_at DESC
        `
        params = [userId, userId, userId, userId]
      }
    } else {
      // Client용: 모든 태스크 조회 (개별 할당 + 다중 할당 서브태스크 담당 포함)
      // 3번째 UNION: 서브태스크로만 할당된 메인 태스크(다중 할당) — 메인 row에 본인이 없어도 서브태스크 담당이면 캘린더에 표시
      sql = `
        SELECT * FROM (
          SELECT
            ta.id,
            ta.title,
            ta.status,
            ta.priority,
            ta.assigned_by,
            ta.assigned_to,
            ta.content,
            ta.file_keys,
            ta.due_date,
            ta.created_at,
            ta.updated_at,
            ta.completed_at,
            (${TASK_DATETIME_SQL('ta')}) as task_datetime,
            CASE WHEN ta.assigned_by = ? THEN 'assigned' WHEN ta.assigned_to = ? THEN 'received' ELSE 'received' END as task_type,
            p_assigned_to.full_name as assigned_to_name,
            p_assigned_to.email as assigned_to_email,
            p_assigned_by.full_name as assigned_by_name,
            p_assigned_by.email as assigned_by_email,
            FALSE as is_subtask,
            NULL as parent_task_id,
            NULL as subtitle
          FROM task_assignments ta
          LEFT JOIN profiles p_assigned_to ON ta.assigned_to = p_assigned_to.id
          LEFT JOIN profiles p_assigned_by ON ta.assigned_by = p_assigned_by.id
          WHERE (ta.assigned_by = ? OR ta.assigned_to = ?)
          
          UNION ALL
          
          SELECT
            ts.id,
            CONCAT(ta.title, ' - ', ts.subtitle) as title,
            ts.status,
            ta.priority,
            ta.assigned_by,
            ts.assigned_to,
            ts.content,
            ts.file_keys,
            ta.due_date,
            ts.created_at,
            ts.updated_at,
            ts.completed_at,
            (${SUBTASK_DATETIME_SQL('ts', 'ta')}) as task_datetime,
            'received' as task_type,
            p_assigned_to.full_name as assigned_to_name,
            p_assigned_to.email as assigned_to_email,
            p_assigned_by.full_name as assigned_by_name,
            p_assigned_by.email as assigned_by_email,
            TRUE as is_subtask,
            ts.task_id as parent_task_id,
            ts.subtitle
          FROM task_subtasks ts
          INNER JOIN task_assignments ta ON ts.task_id = ta.id
          LEFT JOIN profiles p_assigned_to ON ts.assigned_to = p_assigned_to.id
          LEFT JOIN profiles p_assigned_by ON ta.assigned_by = p_assigned_by.id
          WHERE ts.assigned_to = ?
          
          UNION ALL
          
          SELECT
            ta.id,
            ta.title,
            (SELECT ts_ref.status FROM task_subtasks ts_ref WHERE ts_ref.task_id = ta.id AND ts_ref.assigned_to = ? LIMIT 1) as status,
            ta.priority,
            ta.assigned_by,
            ta.assigned_to,
            ta.content,
            ta.file_keys,
            ta.due_date,
            ta.created_at,
            ta.updated_at,
            ta.completed_at,
            (${TASK_DATETIME_SQL('ta')}) as task_datetime,
            'received' as task_type,
            p_assigned_to.full_name as assigned_to_name,
            p_assigned_to.email as assigned_to_email,
            p_assigned_by.full_name as assigned_by_name,
            p_assigned_by.email as assigned_by_email,
            FALSE as is_subtask,
            NULL as parent_task_id,
            NULL as subtitle
          FROM task_assignments ta
          LEFT JOIN profiles p_assigned_to ON ta.assigned_to = p_assigned_to.id
          LEFT JOIN profiles p_assigned_by ON ta.assigned_by = p_assigned_by.id
          WHERE ta.id IN (SELECT task_id FROM task_subtasks WHERE assigned_to = ?)
            AND ta.assigned_by != ?
            AND (ta.assigned_to IS NULL OR ta.assigned_to != ?)
        ) combined
        ORDER BY combined.task_datetime, combined.created_at DESC
      `
      params = [userId, userId, userId, userId, userId, userId, userId, userId, userId]
    }

    const tasks = await query(sql, params)

    // 날짜별로 그룹화 (날짜 형식 정규화: YYYY-MM-DD)
    // 서브태스크들은 parent task로 그룹화
    const tasksByDate: Record<string, { assigned: Map<string, any>, received: Map<string, any> }> = {}
    
    // 날짜 추출 헬퍼 함수
    const extractDate = (datetime: any): string | null => {
      if (!datetime) return null
      try {
        const dateObj = datetime instanceof Date ? datetime : new Date(datetime)
        if (isNaN(dateObj.getTime())) return null
        
        const seoulDateStr = dateObj.toLocaleString("en-US", { 
          timeZone: "Asia/Seoul",
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        })
        const [month, day, year] = seoulDateStr.split("/")
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      } catch {
        return null
      }
    }
    
    // 1단계: 메인 태스크와 서브태스크 분리 및 그룹화
    const mainTasks = new Map<string, any>() // parent task ID -> task data
    const subtasksByParent = new Map<string, any[]>() // parent task ID -> subtasks array
    
    tasks.forEach((task: any) => {
      // file_keys 파싱
      let fileKeys = []
      try {
        fileKeys = typeof task.file_keys === 'string' 
          ? JSON.parse(task.file_keys) 
          : task.file_keys || []
      } catch {
        fileKeys = []
      }
      
      const processedTask = {
        ...task,
        file_keys: fileKeys
      }
      
      if (processedTask.is_subtask) {
        // 서브태스크는 parent_task_id로 그룹화
        const parentId = processedTask.parent_task_id
        if (!subtasksByParent.has(parentId)) {
          subtasksByParent.set(parentId, [])
        }
        subtasksByParent.get(parentId)!.push(processedTask)
      } else {
        // 메인 태스크 저장
        mainTasks.set(processedTask.id, processedTask)
      }
    })
    
    // 2단계: 메인 태스크에 서브태스크 정보 병합
    mainTasks.forEach((mainTask, taskId) => {
      const subtasks = subtasksByParent.get(taskId) || []
      if (subtasks.length > 0) {
        mainTask.subtasks = subtasks
        // 여러 담당자 정보 추가
        mainTask.assignees = subtasks.map((st: any) => ({
          id: st.assigned_to,
          name: st.assigned_to_name,
          email: st.assigned_to_email,
          status: st.status,
          completed_at: st.completed_at,
        }))
      }
    })
    
    // 3단계: 날짜별로 분류
    mainTasks.forEach((task) => {
      const date = extractDate(task.task_datetime)
      
      if (!date) {
        return
      }
      
      if (!tasksByDate[date]) {
        tasksByDate[date] = { assigned: new Map(), received: new Map() }
      }
      
      // task_type에 따라 분류 (중복 제거)
      if (task.task_type === 'assigned') {
        if (!tasksByDate[date].assigned.has(task.id)) {
          tasksByDate[date].assigned.set(task.id, task)
        }
      } else {
        if (!tasksByDate[date].received.has(task.id)) {
          tasksByDate[date].received.set(task.id, task)
        }
      }
    })
    
    // Map을 배열로 변환하여 반환
    const result: Record<string, { assigned: any[], received: any[] }> = {}
    Object.keys(tasksByDate).forEach(date => {
      result[date] = {
        assigned: Array.from(tasksByDate[date].assigned.values()),
        received: Array.from(tasksByDate[date].received.values()),
      }
    })

    return NextResponse.json({ tasksByDate: result })
  } catch (error: unknown) {
    console.error("[Tasks Calendar API] Error:", error)
    const errorMessage = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

