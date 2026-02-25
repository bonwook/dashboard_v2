/**
 * 태스크–S3 연결 공통 로직 (다중 S3 → 1 task, 기존 업무에 S3 붙이기)
 * assign 라우트·attach-s3 라우트에서 사용
 */
import { query } from "@/lib/db/mysql"

/**
 * 여러 s3_updates 행을 한 task에 연결 (task_id, status 업데이트)
 */
export async function linkS3UpdatesToTask(
  taskId: string,
  s3UpdateIds: string[]
): Promise<void> {
  if (!s3UpdateIds || s3UpdateIds.length === 0) return
  const ids = s3UpdateIds.filter((id) => typeof id === "string" && id.trim())
  if (ids.length === 0) return

  for (const id of ids) {
    try {
      await query(`UPDATE s3_updates SET task_id = ? WHERE id = ?`, [taskId, id])
    } catch {
      // task_id 컬럼 없으면 무시
    }
    try {
      await query(`UPDATE s3_updates SET status = 'pending' WHERE id = ?`, [id])
    } catch {
      // status 컬럼 없으면 무시
    }
  }
}
