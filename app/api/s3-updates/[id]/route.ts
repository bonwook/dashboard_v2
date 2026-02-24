import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { query, queryOne } from "@/lib/db/mysql"
import { toS3Key } from "@/lib/utils/s3Updates"

// GET /api/s3-updates/[id] - 단일 s3_update 조회
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

    const roleRes = await queryOne(
      `SELECT role FROM profiles WHERE id = ?`,
      [decoded.id]
    )
    if (!roleRes || (roleRes as { role: string }).role === "client") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { id } = await params
    const row = await queryOne(
      `SELECT id, file_name, bucket_name, file_size, upload_time, created_at, task_id
       FROM s3_updates WHERE id = ?`,
      [id]
    )

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const r = row as Record<string, unknown> & { task_id?: string | null; status?: string | null }
    const s3Update = {
      ...r,
      task_id: r.task_id ?? null,
      status: r.status ?? "pending",
      s3_key: toS3Key(r as { file_name: string; bucket_name?: string | null }),
    }

    return NextResponse.json({ s3Update })
  } catch (error: unknown) {
    console.error("[s3-updates/:id] Error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE /api/s3-updates/[id] - s3_update 행 DB에서 삭제 (admin/staff만)
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

    const roleRes = await queryOne(
      `SELECT role FROM profiles WHERE id = ?`,
      [decoded.id]
    )
    if (!roleRes || (roleRes as { role: string }).role === "client") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { id } = await params
    const existing = await queryOne(
      `SELECT id FROM s3_updates WHERE id = ?`,
      [id]
    )
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    await query(`DELETE FROM s3_updates WHERE id = ?`, [id])
    return NextResponse.json({ success: true, message: "S3 업데이트가 삭제되었습니다." })
  } catch (error: unknown) {
    console.error("[s3-updates/:id DELETE] Error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
