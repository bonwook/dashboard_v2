/**
 * POST /api/tasks/[id]/attach-s3 - 기존 업무에 S3 건 추가 연결
 * 요청자(assigned_by) 또는 admin만 호출 가능
 */
import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { query, queryOne } from "@/lib/db/mysql"
import { linkS3UpdatesToTask } from "@/lib/taskS3Link"

export async function POST(
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

    const { id: taskId } = await params
    if (!taskId) {
      return NextResponse.json({ error: "task id가 필요합니다" }, { status: 400 })
    }

    const body = await request.json()
    const raw = body.s3_update_ids
    const s3UpdateIds = Array.isArray(raw)
      ? (raw as unknown[]).map((id) => String(id)).filter((id) => id.trim())
      : []

    if (s3UpdateIds.length === 0) {
      return NextResponse.json({ error: "s3_update_ids 배열이 필요합니다" }, { status: 400 })
    }

    const task = await queryOne(
      `SELECT id, assigned_by FROM task_assignments WHERE id = ?`,
      [taskId]
    ) as { id: string; assigned_by: string } | null

    if (!task) {
      return NextResponse.json({ error: "업무를 찾을 수 없습니다" }, { status: 404 })
    }

    const isRequester = task.assigned_by === decoded.id
    const [roleRow] = await query(
      "SELECT role FROM profiles WHERE id = ?",
      [decoded.id]
    ) as { role?: string }[]
    const isStaff = roleRow?.role === "staff" || roleRow?.role === "admin"

    if (!isRequester && !isStaff) {
      return NextResponse.json({ error: "권한이 없습니다. 요청자 또는 관리자만 S3를 붙일 수 있습니다." }, { status: 403 })
    }

    const alreadyLinked = await query(
      `SELECT id FROM s3_updates WHERE id IN (${s3UpdateIds.map(() => "?").join(",")}) AND task_id IS NOT NULL AND task_id != '' AND task_id != ?`,
      [...s3UpdateIds, taskId]
    )
    if (Array.isArray(alreadyLinked) && alreadyLinked.length > 0) {
      return NextResponse.json(
        { error: "선택한 S3 건 중 이미 다른 업무에 연결된 건이 있습니다." },
        { status: 400 }
      )
    }

    await linkS3UpdatesToTask(taskId, s3UpdateIds)

    return NextResponse.json({
      success: true,
      message: `${s3UpdateIds.length}건의 S3가 업무에 연결되었습니다`,
      taskId,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
