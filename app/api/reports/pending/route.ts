import { type NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db/mysql"
import { verifyToken } from "@/lib/auth"

// GET /api/reports/pending - 리포트 폼 미작성 태스크 목록 조회
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
    const userRole = decoded.role

    // report_info 테이블 존재 여부 확인
    const tableRows = await query(
      `SELECT COUNT(*) as cnt
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'report_info'`
    )
    const hasReportInfoTable = Number((tableRows as any)?.[0]?.cnt || 0) > 0

    if (!hasReportInfoTable) {
      // report_info 테이블이 없으면 모든 완료 태스크 반환
      let tasks
      if (userRole === "staff") {
        tasks = await query(
          `SELECT 
            ta.id,
            ta.title as patient_name,
            ta.priority as priority,
            ta.created_at,
            ta.completed_at,
            ta.assigned_by,
            ta.assigned_to,
            p_assigned_by.full_name as assigned_by_name,
            p_assigned_to.full_name as assigned_to_name
          FROM task_assignments ta
          LEFT JOIN profiles p_assigned_by ON ta.assigned_by = p_assigned_by.id
          LEFT JOIN profiles p_assigned_to ON ta.assigned_to = p_assigned_to.id
          WHERE ta.status = 'completed'
          ORDER BY ta.completed_at DESC`
        )
      } else {
        tasks = await query(
          `SELECT 
            ta.id,
            ta.title as patient_name,
            ta.priority as priority,
            ta.created_at,
            ta.completed_at,
            ta.assigned_by,
            ta.assigned_to,
            p_assigned_by.full_name as assigned_by_name,
            p_assigned_to.full_name as assigned_to_name
          FROM task_assignments ta
          LEFT JOIN profiles p_assigned_by ON ta.assigned_by = p_assigned_by.id
          LEFT JOIN profiles p_assigned_to ON ta.assigned_to = p_assigned_to.id
          WHERE ta.status = 'completed'
            AND (ta.assigned_by = ? OR ta.assigned_to = ?)
          ORDER BY ta.completed_at DESC`,
          [decoded.id, decoded.id]
        )
      }
      return NextResponse.json({ tasks })
    }

    // report_info 테이블이 있으면 리포트 미작성 태스크만 반환
    let tasks
    if (userRole === "staff") {
      tasks = await query(
        `SELECT 
          ta.id,
          ta.title as patient_name,
          ta.priority as priority,
          ta.created_at,
          ta.completed_at,
          ta.assigned_by,
          ta.assigned_to,
          p_assigned_by.full_name as assigned_by_name,
          p_assigned_to.full_name as assigned_to_name
        FROM task_assignments ta
        LEFT JOIN profiles p_assigned_by ON ta.assigned_by = p_assigned_by.id
        LEFT JOIN profiles p_assigned_to ON ta.assigned_to = p_assigned_to.id
        LEFT JOIN report_info ri ON ri.task_id = ta.id
        WHERE ta.status = 'completed'
          AND ri.id IS NULL
        ORDER BY ta.completed_at DESC`
      )
    } else {
      tasks = await query(
        `SELECT 
          ta.id,
          ta.title as patient_name,
          ta.priority as priority,
          ta.created_at,
          ta.completed_at,
          ta.assigned_by,
          ta.assigned_to,
          p_assigned_by.full_name as assigned_by_name,
          p_assigned_to.full_name as assigned_to_name
        FROM task_assignments ta
        LEFT JOIN profiles p_assigned_by ON ta.assigned_by = p_assigned_by.id
        LEFT JOIN profiles p_assigned_to ON ta.assigned_to = p_assigned_to.id
        LEFT JOIN report_info ri ON ri.task_id = ta.id
        WHERE ta.status = 'completed'
          AND (ta.assigned_by = ? OR ta.assigned_to = ?)
          AND ri.id IS NULL
        ORDER BY ta.completed_at DESC`,
        [decoded.id, decoded.id]
      )
    }

    return NextResponse.json({ tasks })
  } catch (error) {
    console.error("[v0] Error fetching pending tasks:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
