import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { GetObjectCommand } from "@aws-sdk/client-s3"
import archiver from "archiver"
import { Readable } from "stream"
import { s3Client } from "@/lib/aws/s3"

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME!

// POST /api/storage/download-zip - 선택된 파일들을 ZIP으로 압축하여 다운로드
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

    if (!fileKeys || !Array.isArray(fileKeys) || fileKeys.length === 0) {
      return NextResponse.json({ error: "파일 키 목록이 필요합니다" }, { status: 400 })
    }

    // 사용자가 자신의 파일만 다운로드할 수 있도록 확인
    const userPrefix = `${decoded.id}/`
    const validFileKeys = fileKeys.filter((key: string) => key.startsWith(userPrefix))

    if (validFileKeys.length === 0) {
      return NextResponse.json({ error: "다운로드할 수 있는 파일이 없습니다" }, { status: 403 })
    }

    // 파일 키 목록은 이미 클라이언트에서 폴더 내부 파일까지 포함하여 전달됨

    // ZIP 파일 생성 (메모리 스트림 사용)
    const chunks: Buffer[] = []
    const archive = archiver("zip", {
      zlib: { level: 9 }, // 최대 압축
    })

    // 스트림 데이터 수집
    archive.on("data", (chunk: Buffer) => {
      chunks.push(chunk)
    })

    // Promise로 ZIP 완료 대기
    const archivePromise = new Promise<void>((resolve, reject) => {
      archive.on("end", resolve)
      archive.on("error", reject)
    })

    // 각 파일을 S3에서 다운로드하여 ZIP에 추가
    const downloadPromises = validFileKeys.map(async (fileKey: string) => {
      try {
        const command = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: fileKey,
        })

        const response = await s3Client.send(command)
        const stream = response.Body as Readable | undefined

        if (!stream) {
          console.warn(`[Download ZIP] 파일을 찾을 수 없음: ${fileKey}`)
          return null
        }

        // userId를 제거한 나머지 경로를 ZIP 내부 경로로 사용 (폴더 구조 유지)
        // 예: "userId/excel/file1.xlsx" -> "excel/file1.xlsx"
        // 예: "userId/excel/subfolder/file2.xlsx" -> "excel/subfolder/file2.xlsx"
        const keyParts = fileKey.split("/")
        if (keyParts.length > 1) {
          // userId 제거 (첫 번째 부분)
          const zipPath = keyParts.slice(1).join("/")
          
          // 스트림을 버퍼로 변환
          const fileChunks: Uint8Array[] = []
          for await (const chunk of stream) {
            fileChunks.push(chunk)
          }
          const buffer = Buffer.concat(fileChunks)

          // ZIP에 파일 추가 (폴더 구조 유지)
          archive.append(buffer, { name: zipPath })
          return { fileKey, zipPath, success: true }
        } else {
          // userId만 있는 경우는 없지만, 안전을 위해 처리
          const fileName = fileKey.split("/").pop() || "unknown"
          const fileChunks: Uint8Array[] = []
          for await (const chunk of stream) {
            fileChunks.push(chunk)
          }
          const buffer = Buffer.concat(fileChunks)
          archive.append(buffer, { name: fileName })
          return { fileKey, zipPath: fileName, success: true }
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        console.error(`[Download ZIP] 파일 다운로드 오류 (${fileKey}):`, error)
        return { fileKey, success: false, error: errorMessage }
      }
    })

    // 모든 파일 다운로드 완료 대기
    await Promise.all(downloadPromises)

    // ZIP 완료
    archive.finalize()
    await archivePromise

    // 모든 청크를 하나의 버퍼로 합치기
    const zipBuffer = Buffer.concat(chunks)

    // ZIP 파일 반환
    return new NextResponse(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="files-${Date.now()}.zip"`,
        "Content-Length": zipBuffer.length.toString(),
      },
    })
  } catch (error: unknown) {
    console.error("[Download ZIP] 압축 다운로드 오류:", error)
    const errorMessage = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

