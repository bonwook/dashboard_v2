import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { getSignedDownloadUrl } from "@/lib/aws/s3"

// GET /api/storage/signed-url - 서명된 URL 생성
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

    const { searchParams } = new URL(request.url)
    const path = searchParams.get("path")
    const expiresIn = Number.parseInt(searchParams.get("expiresIn") || "3600")

    if (!path) {
      return NextResponse.json({ error: "Path is required" }, { status: 400 })
    }

    // Extract key from s3:// path or use as-is
    const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME!
    const key = path.startsWith("s3://") ? path.replace(`s3://${BUCKET_NAME}/`, "") : path

    try {
      const signedUrl = await getSignedDownloadUrl(key, expiresIn)
      return NextResponse.json({ signedUrl })
    } catch (s3Error: any) {
      // S3 NoSuchKey 에러 처리
      if (s3Error?.name === 'NoSuchKey' || s3Error?.Code === 'NoSuchKey' || s3Error?.message?.includes('NoSuchKey')) {
        return NextResponse.json(
          { error: "파일이 존재하지 않거나 다운로드 기간이 지났습니다." },
          { status: 404 }
        )
      }
      throw s3Error
    }
  } catch (error) {
    console.error("[v0] Error creating signed URL:", error)
    const errorMessage = error instanceof Error ? error.message : "Internal server error"
    
    // S3 에러 메시지 확인
    if (errorMessage.includes('NoSuchKey') || errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { error: "파일이 존재하지 않거나 다운로드 기간이 지났습니다." },
        { status: 404 }
      )
    }
    
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

