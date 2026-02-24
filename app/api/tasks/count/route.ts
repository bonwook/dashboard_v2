import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { query } from "@/lib/db/mysql"

// GET /api/tasks/count - 현재 사용자에게 지정된 task 개수 조회
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

    // 메인 할당: 미완료만
    const [mainStats] = await query(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'on_hold' THEN 1 ELSE 0 END) as on_hold,
        SUM(CASE WHEN status = 'awaiting_completion' THEN 1 ELSE 0 END) as awaiting_completion,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM task_assignments 
      WHERE assigned_to = ? AND status != 'completed'`,
      [decoded.id]
    )

    // 서브태스크 할당: 메인 task가 미완료인 것만 (메인 완료 시 받은 요청에서 제외)
    const [subStats] = await query(
      `SELECT COUNT(*) as total
       FROM task_subtasks ts
       INNER JOIN task_assignments ta ON ts.task_id = ta.id AND ta.status != 'completed'
       WHERE ts.assigned_to = ?`,
      [decoded.id]
    )

    const mainTotal = Number(mainStats?.total) || 0
    const subTotal = Number(subStats?.total) || 0
    const total = mainTotal + subTotal

    if (total === 0) {
      return NextResponse.json({
        total: 0,
        pending: 0,
        in_progress: 0,
        on_hold: 0,
        awaiting_completion: 0,
        completed: 0,
      })
    }

    return NextResponse.json({
      total,
      pending: Number(mainStats?.pending) || 0,
      in_progress: Number(mainStats?.in_progress) || 0,
      on_hold: Number(mainStats?.on_hold) || 0,
      awaiting_completion: Number(mainStats?.awaiting_completion) || 0,
      completed: Number(mainStats?.completed) || 0,
    })
  } catch (error: unknown) {
    console.error("[Tasks Count API] Error fetching task counts:", error)
    const errorMessage = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

