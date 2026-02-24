import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { GetObjectCommand } from "@aws-sdk/client-s3"
import { uploadToS3, s3Client } from "@/lib/aws/s3"
import { query } from "@/lib/db/mysql"
import { randomUUID } from "crypto"
import { isValidS3Key } from "@/lib/utils/filename"
import {
  formatSize,
  getContentType,
  getFileTypeFromExtension,
  isSupportedArchiveExt,
  extractZipEntries,
  getZipEntryStats,
  extract7zEntries,
  get7zEntryStats,
  inBatches,
  type ExtractEntry,
} from "@/lib/archive"

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME!
const BATCH_SIZE = 15

/** 배치 단위로 S3 업로드 + DB 삽입 후 레코드 반환 */
async function processBatch(
  batch: ExtractEntry[],
  targetFolderPath: string,
  userId: string
): Promise<
  Array<{
    fileId: string
    fileName: string
    targetKey: string
    fileSize: number
    contentType: string
    fileType: string
  }>
> {
  const prefix = targetFolderPath ? targetFolderPath + "/" : ""
  const results = await Promise.all(
    batch.map(async (entry) => {
      const normalizedPath = entry.path.replace(/^\/+/, "").replace(/\\/g, "/")
      const targetKey = prefix + normalizedPath
      const fileExtension = entry.path.split(".").pop()?.toLowerCase() ?? "bin"
      const contentType = getContentType(fileExtension)
      const fileType = getFileTypeFromExtension(fileExtension)

      await uploadToS3(entry.buffer, targetKey, contentType)

      return {
        fileId: randomUUID(),
        fileName: normalizedPath.split("/").pop() ?? normalizedPath,
        targetKey,
        fileSize: entry.buffer.length,
        contentType,
        fileType,
      }
    })
  )

  for (const record of results) {
    await query(
      `INSERT INTO user_files (
        id, user_id, file_name, file_path, s3_key, s3_bucket,
        file_size, content_type, file_type, uploaded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        record.fileId,
        userId,
        record.fileName,
        `s3://${BUCKET_NAME}/${record.targetKey}`,
        record.targetKey,
        BUCKET_NAME,
        record.fileSize,
        record.contentType,
        record.fileType,
      ]
    )
  }

  return results
}

// POST /api/storage/extract - zip/7z 파일 압축 해제
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

    const userId = decoded.id
    const body = await request.json()
    const { zipKey, zipPassword, targetPath: requestedTargetPath } = body as {
      zipKey: string
      zipPassword?: string
      targetPath?: string
    }

    if (!zipKey) {
      return NextResponse.json({ error: "zipKey is required" }, { status: 400 })
    }

    if (!isValidS3Key(zipKey, userId)) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })
    }

    const key = zipKey.startsWith("s3://")
      ? zipKey.replace(`s3://${BUCKET_NAME}/`, "")
      : zipKey

    if (!isSupportedArchiveExt(key)) {
      return NextResponse.json(
        { error: "지원하지 않는 압축 형식입니다. .zip 또는 .7z만 가능합니다." },
        { status: 400 }
      )
    }

    // 압축 해제 대상: 현재 경로 + 압축파일명(확장자 제외) 폴더 안에 파일들이 나오도록
    const archiveFileName = key.split("/").pop() ?? ""
    const archiveBaseName = archiveFileName.replace(/\.(zip|7z)$/i, "") || "extracted"

    let basePath: string
    if (requestedTargetPath != null && requestedTargetPath !== "") {
      const normalized = requestedTargetPath.replace(/\/+$/, "")
      const prefix = normalized === "" ? "" : normalized + "/"
      if (!key.startsWith(prefix)) {
        return NextResponse.json(
          { error: "대상 경로가 압축 파일 위치와 일치하지 않습니다." },
          { status: 400 }
        )
      }
      if (normalized !== "" && !isValidS3Key(normalized + "/dummy", userId)) {
        return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })
      }
      basePath = normalized
    } else {
      const parts = key.split("/")
      basePath = parts.length > 1 ? parts.slice(0, -1).join("/") : ""
    }
    const targetFolderPath = basePath ? `${basePath}/${archiveBaseName}` : archiveBaseName
    const is7z = key.toLowerCase().endsWith(".7z")

    const getObjectCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    })
    const response = await s3Client.send(getObjectCommand)
    if (!response.Body) {
      return NextResponse.json({ error: "Failed to download archive" }, { status: 500 })
    }

    const chunks: Uint8Array[] = []
    const bodyStream = response.Body as AsyncIterable<Uint8Array>
    for await (const chunk of bodyStream) {
      chunks.push(chunk)
    }
    const buffer = Buffer.concat(chunks)

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let extractedCount = 0
          let extractedSize = 0
          const extractedFiles: string[] = []

          let stats: { count: number; totalUncompressedSize: number }
          if (is7z) {
            try {
              stats = await get7zEntryStats(buffer)
            } catch {
              stats = { count: 0, totalUncompressedSize: 0 }
            }
          } else {
            stats = await getZipEntryStats(buffer)
          }
          const totalFiles = stats.count
          const totalSize = stats.totalUncompressedSize

          if (!is7z && totalFiles === 0) {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: "complete",
                  progress: 100,
                  success: true,
                  message: "압축 해제할 파일이 없습니다",
                  extractedCount: 0,
                  extractedSize: 0,
                  totalSize: 0,
                }) + "\n"
              )
            )
            controller.close()
            return
          }

          const progressMessage =
            totalSize > 0
              ? `${totalFiles}개 파일 확인됨 (총 ${formatSize(totalSize)})`
              : `${totalFiles}개 파일 확인됨`

          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "progress",
                progress: 5,
                message: progressMessage,
                extractedCount: 0,
                totalFiles,
                extractedSize: 0,
                totalSize,
              }) + "\n"
            )
          )

          const entriesGen = is7z
            ? extract7zEntries(buffer, zipPassword)
            : extractZipEntries(buffer, zipPassword)

          for await (const batch of inBatches(entriesGen, BATCH_SIZE)) {
            const records = await processBatch(batch, targetFolderPath, userId)
            for (const r of records) {
              extractedFiles.push(r.targetKey)
              extractedSize += r.fileSize
            }
            extractedCount += batch.length

            const progress =
              totalFiles > 0
                ? 5 + Math.floor((extractedCount / totalFiles) * 90)
                : 5 + Math.min(85, extractedCount * 2)
            const sizeProgress =
              totalSize > 0 ? Math.floor((extractedSize / totalSize) * 100) : 0

            const progressMessage =
              totalFiles > 0
                ? `${extractedCount}/${totalFiles} 파일 압축 해제 중` +
                  (totalSize > 0
                    ? ` (${formatSize(extractedSize)} / ${formatSize(totalSize)})`
                    : "")
                : `${extractedCount}개 파일 압축 해제 중 (${formatSize(extractedSize)})`
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: "progress",
                  progress,
                  message: progressMessage,
                  extractedCount,
                  totalFiles,
                  extractedSize,
                  totalSize,
                  sizeProgress,
                }) + "\n"
              )
            )
          }

          if (totalFiles > 0 && extractedCount === 0) {
            const errMsg =
              "7z 압축 해제 후 파일이 생성되지 않았습니다. 비밀번호가 필요하거나 7za 실행/경로 문제일 수 있습니다."
            console.warn("[Extract]", errMsg)
            controller.enqueue(
              encoder.encode(
                JSON.stringify({ type: "error", error: errMsg }) + "\n"
              )
            )
            controller.close()
            return
          }

          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "complete",
                progress: 100,
                success: true,
                message: `${extractedCount}개의 파일이 압축 해제되었습니다 (총 ${formatSize(extractedSize)})`,
                extractedCount,
                totalFiles,
                extractedSize,
                totalSize,
                targetFolder: targetFolderPath,
                files: extractedFiles,
              }) + "\n"
            )
          )
          controller.close()
        } catch (error) {
          console.error("[Extract API] Error:", error)
          const message = error instanceof Error ? error.message : "압축 해제 실패"
          const code =
            message === "ZIP_MISSING_PASSWORD" ? "ZIP_MISSING_PASSWORD" : undefined
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "error",
                error: code
                  ? "비밀번호가 설정된 압축 파일입니다. 비밀번호를 입력해 주세요."
                  : message,
                code,
              }) + "\n"
            )
          )
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error) {
    console.error("[Extract API] Error:", error)
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message || "Internal server error" },
        { status: 500 }
      )
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
