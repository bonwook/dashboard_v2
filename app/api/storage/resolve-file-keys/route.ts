import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { query } from "@/lib/db/mysql"

// POST /api/storage/resolve-file-keys - file_keys 배열을 받아서 user_files에서 실제 s3_key를 찾아서 반환
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
    const { fileKeys } = body

    if (!fileKeys || !Array.isArray(fileKeys)) {
      return NextResponse.json({ error: "파일 키 목록이 필요합니다" }, { status: 400 })
    }

    if (fileKeys.length === 0) {
      return NextResponse.json({ resolvedKeys: [] })
    }

    // staff/admin은 Worklist 등에서 타 사용자 파일도 열람해야 하므로 user_id 제한 없이 resolve 허용
    const roleRows = await query(`SELECT role FROM profiles WHERE id = ?`, [decoded.id])
    const role = roleRows && roleRows.length > 0 ? (roleRows[0] as any).role : null
    const isStaffOrAdmin = role === "admin" || role === "staff"

    // user_files 테이블에서 s3_key로 직접 조회 (같은 키로 재업로드된 경우 최신 행을 쓰기 위해 uploaded_at DESC)
    const placeholders = fileKeys.map(() => '?').join(',')
    const files = await query(
      `SELECT s3_key, file_name, user_id, uploaded_at
       FROM user_files
       WHERE s3_key IN (${placeholders})${isStaffOrAdmin ? "" : " AND user_id = ?"}
       ORDER BY uploaded_at DESC`,
      isStaffOrAdmin ? [...fileKeys] : [...fileKeys, decoded.id]
    )

    // 같은 s3_key로 여러 행이 있으면(재업로드) 가장 최근 업로드(uploaded_at 최신) 사용
    const getLatestByKey = (key: string) => {
      const matching = (files as any[]).filter((f: any) => f.s3_key === key)
      if (matching.length === 0) return null
      return matching[0] // 이미 ORDER BY uploaded_at DESC 라서 첫 번째가 최신
    }

    // file_keys 순서대로 매핑. uploaded_at은 ISO 문자열로 통일해 클라이언트에서 파일별 7일 만료 계산이 일관되게 되도록 함.
    const resolvedKeys = fileKeys.map((fileKey: string) => {
      const file = getLatestByKey(fileKey)
      if (file) {
        const raw = (file as any).uploaded_at
        let uploadedAt: string | null = null
        if (raw != null) {
          try {
            const d = raw instanceof Date ? raw : new Date(raw)
            uploadedAt = Number.isNaN(d.getTime()) ? null : d.toISOString()
          } catch {
            uploadedAt = null
          }
        }
        return {
          originalKey: fileKey,
          s3Key: file.s3_key,
          fileName: file.file_name,
          userId: (file as any).user_id || null,
          uploadedAt,
        }
      }
      // 찾지 못한 경우 원래 키를 그대로 사용
      return {
        originalKey: fileKey,
        s3Key: fileKey,
        fileName: fileKey.split("/").pop() || "파일",
        userId: null,
        uploadedAt: null,
      }
    })

    return NextResponse.json({ resolvedKeys })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

