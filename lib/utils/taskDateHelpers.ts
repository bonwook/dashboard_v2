/**
 * 태스크 날짜 계산 헬퍼 함수 (캘린더 표시용)
 * - 캘린더에는 항상 태스크 생성일(created_at) 기준으로 표시
 * - due_date는 상세/리스트 등 페이지 내부에서만 사용
 */

/**
 * SQL에서 사용할 task_datetime 계산 표현식 (메인 태스크용)
 * 캘린더 표시용: 항상 생성일(created_at) 기준
 * @param alias 테이블 alias (예: 'ta')
 */
export const TASK_DATETIME_SQL = (alias: string) => `${alias}.created_at`

/**
 * 서브태스크용 task_datetime 계산 표현식 (캘린더 표시용)
 * 메인 태스크 생성일 기준으로 캘린더에 표시
 * @param subtaskAlias 서브태스크 테이블 alias (예: 'ts')
 * @param mainTaskAlias 메인 태스크 테이블 alias (예: 'ta')
 */
export const SUBTASK_DATETIME_SQL = (subtaskAlias: string, mainTaskAlias: string) => `${mainTaskAlias}.created_at`

/**
 * 클라이언트 측에서 task datetime 계산 (캘린더/정렬용 — 생성일 기준)
 */
export function calculateTaskDatetime(
  status: string,
  completedAt: string | null,
  dueDate: string | null,
  createdAt: string
): string {
  return createdAt
}
