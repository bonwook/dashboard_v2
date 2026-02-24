import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { ListObjectsV2Command, DeleteObjectsCommand, type ListObjectsV2CommandOutput, type _Object } from "@aws-sdk/client-s3"
import { deleteFile, s3Client } from "@/lib/aws/s3"
import { query } from "@/lib/db/mysql"
import { isValidS3Key } from "@/lib/utils/filename"

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME!

// DELETE /api/storage/delete - 파일 또는 폴더 삭제
export async function DELETE(request: NextRequest) {
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
    const s3Key = searchParams.get("key")
    const isFolder = searchParams.get("isFolder") === "true"

    if (!s3Key) {
      return NextResponse.json({ error: "Key is required" }, { status: 400 })
    }

    // Extract key from s3:// path or use as-is
    const key = s3Key.startsWith("s3://") ? s3Key.replace(`s3://${process.env.AWS_S3_BUCKET_NAME}/`, "") : s3Key

    // 사용자 권한 확인: 파일이 해당 사용자의 파일인지 확인
    const userId = decoded.id
    
    // S3 키 보안 검증
    if (!isValidS3Key(key, userId)) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })
    }

    if (isFolder) {
      // 폴더 삭제 (스트리밍 방식)
      const folderPrefix = key.endsWith('/') ? key : `${key}/`
      
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          try {
            // S3에서 폴더 내 모든 파일 목록 조회 (페이지네이션 포함)
            let allObjects: _Object[] = []
            let continuationToken: string | undefined = undefined
            let isTruncated = true

            // 모든 페이지를 순회하여 전체 파일 목록 수집
            while (isTruncated) {
              const listCommand = new ListObjectsV2Command({
                Bucket: BUCKET_NAME,
                Prefix: folderPrefix,
                ContinuationToken: continuationToken,
                MaxKeys: 1000, // AWS 최대값
              })
              
              const listResponse: ListObjectsV2CommandOutput = await s3Client.send(listCommand)
              const objects = listResponse.Contents || []
              
              allObjects = allObjects.concat(objects)
              
              isTruncated = listResponse.IsTruncated || false
              continuationToken = listResponse.NextContinuationToken
              
              // 목록 조회 진행 상황 전송
              if (isTruncated) {
                controller.enqueue(encoder.encode(JSON.stringify({ 
                  type: 'progress',
                  progress: 5,
                  message: `${allObjects.length}개 파일 확인 중...`
                }) + '\n'))
              }
            }

            const totalFiles = allObjects.length

            if (totalFiles === 0) {
              controller.enqueue(encoder.encode(JSON.stringify({ 
                type: 'complete',
                success: true,
                message: '삭제할 파일이 없습니다',
                deletedCount: 0
              }) + '\n'))
              controller.close()
              return
            }

            // 진행률 전송
            controller.enqueue(encoder.encode(JSON.stringify({ 
              type: 'progress',
              progress: 10,
              message: `${totalFiles}개 파일 확인됨`
            }) + '\n'))

            // 배치로 삭제 (최대 1000개씩, AWS 제한)
            const batchSize = 1000
            let deletedCount = 0
            
            for (let i = 0; i < allObjects.length; i += batchSize) {
              const batch = allObjects.slice(i, i + batchSize)
              
              // 병렬로 삭제
              const deleteCommand = new DeleteObjectsCommand({
                Bucket: BUCKET_NAME,
                Delete: {
                  Objects: batch.map(obj => ({ Key: obj.Key! })),
                  Quiet: false,
                },
              })

              await s3Client.send(deleteCommand)
              deletedCount += batch.length

              // 진행률 계산 (10% ~ 90%)
              const progress = 10 + Math.floor((deletedCount / totalFiles) * 80)
              controller.enqueue(encoder.encode(JSON.stringify({ 
                type: 'progress',
                progress,
                message: `${deletedCount}/${totalFiles} 파일 삭제 중`
              }) + '\n'))
            }

            // DB에서 해당 폴더의 모든 파일 정보 삭제
            await query(
              "DELETE FROM user_files WHERE s3_key LIKE ? AND user_id = ?",
              [`${folderPrefix}%`, userId]
            )

            // 완료 전송
            controller.enqueue(encoder.encode(JSON.stringify({ 
              type: 'complete',
              progress: 100,
              success: true,
              message: `폴더가 삭제되었습니다 (${deletedCount}개 파일)`,
              deletedCount
            }) + '\n'))
            
            controller.close()
          } catch (error) {
            console.error("[API Delete] Folder delete error:", error)
            controller.enqueue(encoder.encode(JSON.stringify({ 
              type: 'error',
              error: error instanceof Error ? error.message : '삭제 실패'
            }) + '\n'))
            controller.close()
          }
        }
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    } else {
      // 개별 파일 삭제
      // DB에서 파일 정보 조회
      const [fileRecord] = await query(
        "SELECT id, s3_key FROM user_files WHERE s3_key = ? AND user_id = ?",
        [key, userId]
      )

      // S3에서 파일 삭제
      try {
        await deleteFile(key)
      } catch (s3Error) {
        console.error("[API Delete] S3 delete error:", s3Error)
        // S3 삭제 실패해도 DB는 삭제 시도 (이미 삭제된 경우 등)
      }

      // DB에서 파일 정보 삭제
      if (fileRecord) {
        await query(
          "DELETE FROM user_files WHERE id = ? AND user_id = ?",
          [fileRecord.id, userId]
        )
      }

      return NextResponse.json({ 
        success: true,
        message: "파일이 삭제되었습니다" 
      })
    }
  } catch (error) {
    console.error("[API Delete] Error deleting:", error)
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

