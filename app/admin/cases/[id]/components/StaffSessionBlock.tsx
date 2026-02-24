import React from "react"
import { Button } from "@/components/ui/button"
import { Loader2, CheckCircle2, FileText } from "lucide-react"
import { format } from "date-fns"
import { ko } from "date-fns/locale"
import { getStatusBadge, getStatusBorderColor } from "@/lib/utils/taskStatusHelpers"
import type { Subtask } from "@/lib/types"

interface StaffSessionBlockProps {
  subtask: Subtask
  isSelected: boolean
  isCompleting: boolean
  onSelect: () => void
  onComplete: (subtaskId: string) => void
  /** 요청자(assigned_by) 또는 admin만 true. 할당받은 staff는 작업끝내기 비활성화를 위해 false */
  canCompleteSubtask?: boolean
  /** 실제 resolve된 담당자 첨부파일이 있을 때만 true (아이콘 표시용) */
  hasAttachment?: boolean
  /** 현재 로그인 사용자 본인 담당 블록이면 true — 분담내용에서 내 블록 강조 */
  isMyBlock?: boolean
  /** 완료대기 상태일 때 태그 클릭으로 대기로 되돌리기 가능 여부 (관리자/요청자) */
  canRevertAwaitingToPending?: boolean
  /** 완료대기 → 대기 되돌리기 실행 콜백 */
  onRevertAwaitingToPending?: (subtaskId: string) => void
  /** 되돌리기 요청 진행 중 여부 */
  isReverting?: boolean
}

/**
 * 담당자 세션 블럭 컴포넌트
 * - 담당자별 작업 상태 표시
 * - 완료 시각 표시
 * - 작업끝내기 버튼 (완료대기 상태일 때만 표시)
 */
export function StaffSessionBlock({
  subtask,
  isSelected,
  isCompleting,
  onSelect,
  onComplete,
  canCompleteSubtask = true,
  hasAttachment = false,
  isMyBlock = false,
  canRevertAwaitingToPending = false,
  onRevertAwaitingToPending,
  isReverting = false,
}: StaffSessionBlockProps) {
  const isCompleted = subtask.status === "completed"
  const isAwaitingCompletion = subtask.status === "awaiting_completion"
  const showRevertBadge = isAwaitingCompletion && canRevertAwaitingToPending && onRevertAwaitingToPending

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect()
        }
      }}
      className={`w-full text-left min-h-[56px] p-3 rounded-lg border-2 transition-all cursor-pointer hover:bg-muted/50 shadow-sm flex flex-col justify-center ${
        isSelected
          ? "ring-2 ring-primary ring-offset-1 shadow-md"
          : ""
      } ${getStatusBorderColor(subtask.status)} ${
        isCompleted
          ? "bg-green-100/50 dark:bg-green-950/30"
          : isMyBlock
            ? "bg-primary/10 dark:bg-primary/20 border-primary/40"
            : "bg-background"
      }`}
    >
      <div className="space-y-1.5 flex flex-col justify-center">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate inline-flex items-center gap-1.5 min-w-0 flex-1">
            <span className="truncate">{subtask.assigned_to_name || subtask.assigned_to_email || "담당자 없음"}</span>
            {hasAttachment && (
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-label="첨부파일 있음" />
            )}
          </span>
          <span className="shrink-0 flex items-center">
            {showRevertBadge ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onRevertAwaitingToPending!(subtask.id)
                }}
                disabled={isReverting}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium bg-purple-500/10 text-purple-500 border-purple-500/30 hover:bg-purple-500/20 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
                title="클릭 시 담당자 업무를 대기로 되돌립니다"
              >
                {isReverting ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    되돌리는 중
                  </>
                ) : (
                  "완료대기"
                )}
              </button>
            ) : (
              getStatusBadge(subtask.status)
            )}
          </span>
        </div>
        
        {/* 완료 시각 표시 */}
        {isCompleted && subtask.completed_at && (
          <div className="flex items-center gap-1.5 text-[11px] text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>
              {format(new Date(subtask.completed_at), "yyyy.MM.dd HH:mm", { locale: ko })}
            </span>
          </div>
        )}
        
        {/* 작업끝내기 버튼 - 완료대기 상태이고 요청자/admin만 표시 (할당받은 staff는 비활성화) */}
        {isAwaitingCompletion && canCompleteSubtask && (
          <div className="mt-1.5 pt-1.5 border-t border-muted/50" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onComplete(subtask.id)
              }}
              disabled={isCompleting}
              className="w-full h-8 text-sm bg-green-600 hover:bg-green-700 cursor-pointer"
            >
              {isCompleting ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  처리중
                </>
              ) : (
                "작업끝내기"
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
