/**
 * 클라이언트 대시보드 "새 업무" 알림 추적기.
 * - 태스크가 생성된 지 24시간 이내이고, 아직 "확인"하지 않은 경우 새 업무로 표시.
 * - 확인(seen) 여부는 localStorage에 저장.
 */
import { safeStorage } from "@/lib/utils/safeStorage"

const SEEN_KEY = "new_task_seen_ids"
const ONE_DAY_MS = 24 * 60 * 60 * 1000

export function getSeenTaskIds(): Set<string> {
  const raw = safeStorage.getItem(SEEN_KEY)
  if (!raw) return new Set()
  try {
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

export function markTaskSeen(id: string): void {
  const seen = getSeenTaskIds()
  seen.add(id)
  safeStorage.setItem(SEEN_KEY, JSON.stringify([...seen]))
}

/** 생성 후 24시간 이내이고 아직 확인하지 않은 태스크인지 여부 */
export function isNewTask(task: { id: string; created_at: string }, seenIds: Set<string>): boolean {
  if (seenIds.has(task.id)) return false
  const createdMs = new Date(task.created_at).getTime()
  return Date.now() - createdMs < ONE_DAY_MS
}
