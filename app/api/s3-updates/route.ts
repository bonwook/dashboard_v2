import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { query } from "@/lib/db/mysql"
import { toS3Key } from "@/lib/utils/s3Updates"

// GET /api/s3-updates - 미할당 s3_updates 목록 (admin/staff만)
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

    const roleRes = await query(
      `SELECT role FROM profiles WHERE id = ?`,
      [decoded.id]
    )
    if (!roleRes?.length || (roleRes[0] as { role: string }).role === "client") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const rows = await query(
      `SELECT id, file_name, bucket_name, file_size, upload_time, created_at, task_id
       FROM s3_updates
       ORDER BY COALESCE(upload_time, created_at) DESC`
    )

    const list = (rows || []).map((row: Record<string, unknown>) => {
      const r = row as { file_name: string; bucket_name?: string | null }
      return {
        ...row,
        s3_key: toS3Key(r),
      }
    })

    return NextResponse.json({ s3Updates: list })
  } catch (error: unknown) {
    console.error("[s3-updates] Error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
