import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { query, queryOne } from "@/lib/db/mysql"
import { toS3Key } from "@/lib/utils/s3Updates"
import iconv from "iconv-lite"

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
      `SELECT id, file_name, bucket_name, file_size, metadata, upload_time, created_at, task_id, is_read
       FROM s3_updates WHERE id = ?`,
      [id]
    )

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const r = row as Record<string, unknown> & { task_id?: string | null; status?: string | null; is_read?: boolean | number; metadata?: unknown }
    
    // metadata 인코딩 수정
    let metadata = r.metadata
    if (typeof metadata === 'string' && metadata) {
      try {
        const parsed = JSON.parse(metadata)
        const fixed: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value === 'string') {
            try {
              const buffer = Buffer.from(value, 'binary')
              
              // 1. UTF-8 시도
              let decoded = buffer.toString('utf-8')
              
              // 2. 여전히 깨진 경우 EUC-KR 시도
              if (decoded.includes('�') || /[À-ÿ]{2,}/.test(decoded)) {
                decoded = iconv.decode(buffer, 'euc-kr')
              }
              
              // 3. 여전히 깨진 경우 CP949 시도
              if (decoded.includes('�') || /[À-ÿ]{2,}/.test(decoded)) {
                decoded = iconv.decode(buffer, 'cp949')
              }
              
              fixed[key] = decoded
            } catch {
              fixed[key] = value
            }
          } else {
            fixed[key] = value
          }
        }
        metadata = fixed
      } catch {
        // JSON 파싱 실패 시 원본 사용
      }
    }
    
    const s3Update = {
      ...r,
      metadata,
      task_id: r.task_id ?? null,
      status: r.status ?? "pending",
      is_read: Boolean(r.is_read),
      s3_key: toS3Key(r as { file_name: string; bucket_name?: string | null }),
    }

    return NextResponse.json({ s3Update })
  } catch (error: unknown) {
    console.error("[s3-updates/:id] Error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// PATCH /api/s3-updates/[id] - s3_update 읽음 상태 또는 제목 업데이트 (admin/staff만)
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

    const roleRes = await queryOne(
      `SELECT role FROM profiles WHERE id = ?`,
      [decoded.id]
    )
    if (!roleRes || (roleRes as { role: string }).role === "client") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const { is_read, file_name } = body

    const existing = await queryOne(
      `SELECT id FROM s3_updates WHERE id = ?`,
      [id]
    )
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const updates: string[] = []
    const values: unknown[] = []

    if (typeof is_read === "boolean") {
      updates.push("is_read = ?")
      values.push(is_read)
    }

    if (typeof file_name === "string" && file_name.trim()) {
      updates.push("file_name = ?")
      values.push(file_name.trim())
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
    }

    values.push(id)
    await query(`UPDATE s3_updates SET ${updates.join(", ")} WHERE id = ?`, values)
    
    return NextResponse.json({ success: true, message: "업데이트되었습니다." })
  } catch (error: unknown) {
    console.error("[s3-updates/:id PATCH] Error:", error)
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
