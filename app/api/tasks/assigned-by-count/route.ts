import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { query } from "@/lib/db/mysql"

// GET /api/tasks/assigned-by-count - 현재 사용자가 등록한 task 개수 조회
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

    const taskStats = await query(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'on_hold' THEN 1 ELSE 0 END) as on_hold,
        SUM(CASE WHEN status = 'awaiting_completion' THEN 1 ELSE 0 END) as awaiting_completion,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM task_assignments 
      WHERE assigned_by = ? AND status != 'completed'`,
      [decoded.id]
    )

    if (!taskStats || taskStats.length === 0) {
      return NextResponse.json({
        total: 0,
        pending: 0,
        in_progress: 0,
        on_hold: 0,
        completed: 0,
      })
    }

    return NextResponse.json({
      total: Number(taskStats[0].total) || 0,
      pending: Number(taskStats[0].pending) || 0,
      in_progress: Number(taskStats[0].in_progress) || 0,
      on_hold: Number(taskStats[0].on_hold) || 0,
      completed: Number(taskStats[0].completed) || 0,
    })
  } catch (error: unknown) {
    console.error("[Tasks Assigned By Count API] Error fetching task counts:", error)
    const errorMessage = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

