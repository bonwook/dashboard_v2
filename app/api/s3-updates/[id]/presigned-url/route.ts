import { type NextRequest, NextResponse } from "next/server"
import { NoSuchKey } from "@aws-sdk/client-s3"
import { verifyToken } from "@/lib/auth"
import { queryOne } from "@/lib/db/mysql"
import { getSignedDownloadUrlForTaskDownload } from "@/lib/aws/s3"

const PRESIGN_EXPIRES_SECONDS = 24 * 60 * 60 // 24시간

/** s3_updates에서 쓴 키를 S3 GetObject용 키로 정규화 (s3:// 버킷/ 제거, 슬래시 정리) */
function normalizeS3Key(rawKey: string): string {
  let key = (rawKey ?? "").trim()
  // s3://bucket-name/... 형태면 버킷 접두어 제거 후 경로만 사용
  if (key.startsWith("s3://")) {
    const after = key.slice(5)
    const firstSlash = after.indexOf("/")
    key = firstSlash >= 0 ? after.slice(firstSlash + 1) : after
  }
  // 앞뒤 슬래시 제거, 연속 슬래시는 하나로
  key = key.replace(/\/+/g, "/").replace(/^\//, "").replace(/\/$/, "")
  return key || rawKey
}

// GET /api/s3-updates/[id]/presigned-url - 24시간 유효 다운로드 URL (한 번 발급 후 24시간 사용)
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

    const { id } = await params
    const row = await queryOne(
      `SELECT file_name, bucket_name FROM s3_updates WHERE id = ?`,
      [id]
    )

    if (!row) {
      console.warn("[s3-updates presigned-url] s3_update not found, id:", id)
      return NextResponse.json(
        { error: "해당 ID의 S3 업데이트 레코드를 찾을 수 없습니다.", code: "S3_UPDATE_NOT_FOUND" },
        { status: 404 }
      )
    }

    const r = row as { file_name: string; bucket_name?: string | null }
    const bucketName = (r.bucket_name ?? "").trim()
    if (!bucketName) {
      return NextResponse.json(
        { error: "s3_updates.bucket_name이 비어 있습니다. 버킷 이름을 설정하세요." },
        { status: 400 }
      )
    }
    const s3Key = normalizeS3Key(r.file_name ?? "")
    if (!s3Key) {
      return NextResponse.json(
        { error: "S3 객체 키를 확인할 수 없습니다. file_name을 확인하세요." },
        { status: 400 }
      )
    }

    const signedUrl = await getSignedDownloadUrlForTaskDownload(s3Key, PRESIGN_EXPIRES_SECONDS, bucketName)

    return NextResponse.json({
      url: signedUrl,
      expiresIn: PRESIGN_EXPIRES_SECONDS,
      fileName: r.file_name || s3Key.split("/").pop() || "download",
    })
  } catch (error: unknown) {
    console.error("[s3-updates presigned-url] Error:", error)
    const err = error as { name?: string; Code?: string; message?: string }
    const isNoSuchKey =
      error instanceof NoSuchKey ||
      err?.name === "NoSuchKey" ||
      err?.name === "NotFound" ||
      err?.Code === "NoSuchKey" ||
      String(err?.message ?? "").includes("NoSuchKey") ||
      String(err?.message ?? "").includes("does not exist")
    if (isNoSuchKey) {
      return NextResponse.json(
        {
          error: "해당 파일이 S3에 없습니다. 키가 변경되었거나 삭제되었을 수 있습니다.",
          code: "S3_OBJECT_NOT_FOUND",
        },
        { status: 404 }
      )
    }
    const isCredentialsError =
      err?.name === "CredentialsProviderError" ||
      String(err?.message || "").includes("session has expired") ||
      String(err?.message || "").includes("reauthenticate")
    const message = isCredentialsError
      ? "AWS 자격 증명이 만료되었거나 설정되지 않았습니다. 관리자에게 문의하세요."
      : (error instanceof Error ? error.message : "Internal server error")
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
