import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { query } from "@/lib/db/mysql"
import { toS3Key } from "@/lib/utils/s3Updates"
import iconv from "iconv-lite"

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

    const { searchParams } = new URL(request.url)
    const taskId = searchParams.get("task_id")
    const idsParam = searchParams.get("ids") // 쉼표로 구분된 id 목록

    let rows
    if (idsParam) {
      const ids = idsParam.split(",").map((v) => v.trim()).filter(Boolean)
      if (ids.length === 0) {
        return NextResponse.json({ s3Updates: [] })
      }
      const placeholders = ids.map(() => "?").join(",")
      rows = await query(
        `SELECT id, file_name, bucket_name, file_size, metadata, upload_time, created_at, task_id, is_read, s3_key, note
         FROM s3_updates WHERE id IN (${placeholders})
         ORDER BY COALESCE(upload_time, created_at) DESC`,
        ids
      )
    } else if (taskId) {
      rows = await query(
        `SELECT id, file_name, bucket_name, file_size, metadata, upload_time, created_at, task_id, is_read, s3_key, note
         FROM s3_updates WHERE task_id = ?
         ORDER BY COALESCE(upload_time, created_at) DESC`,
        [taskId]
      )
    } else {
      rows = await query(
        `SELECT id, file_name, bucket_name, file_size, metadata, upload_time, created_at, task_id, is_read, s3_key, note
         FROM s3_updates
         ORDER BY COALESCE(upload_time, created_at) DESC`
      )
    }

    const list = (rows || []).map((row: Record<string, unknown>) => {
      const r = row as { file_name: string; bucket_name?: string | null; metadata?: unknown; s3_key?: string | null }
      
      // metadata가 문자열인 경우 파싱하고 UTF-8 인코딩 문제 수정
      let metadata = r.metadata
      if (typeof metadata === 'string' && metadata) {
        try {
          const parsed = JSON.parse(metadata)
          // 각 필드의 인코딩 문제 수정
          const fixed: Record<string, unknown> = {}
          for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'string') {
              try {
                // 여러 인코딩 방식 시도
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
      
      return {
        ...row,
        metadata,
        // s3_key가 DB에 있으면 사용, 없으면 toS3Key로 생성 (하위 호환성)
        s3_key: r.s3_key || toS3Key(r),
      }
    })

    return NextResponse.json({ s3Updates: list })
  } catch (error: unknown) {
    console.error("[s3-updates] Error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
