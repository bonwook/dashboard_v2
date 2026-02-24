"use client"

import { useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { SafeHtml } from "@/components/safe-html"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Send, X } from "lucide-react"

export type CommentItem = {
  id: string
  content: string
  created_at: string
  user_id: string
  full_name: string | null
  /** 다중 task 댓글 합칠 때 어느 task 소속인지 */
  task_id?: string
}

/** task_id별 요청자/담당자 매핑 (댓글에 요청자/담당자 라벨 표시용) */
export type TaskIdToRoleMap = Record<
  string,
  { assigned_by?: string | null; assigned_to?: string | null }
>

interface TaskCommentSectionProps {
  taskId: string | null
  /** 다중 업무 시 부모+서브 task id 목록. 있으면 여러 task 댓글을 합쳐서 시간순 표시 */
  taskIds?: string[] | null
  /** task_id → { assigned_by, assigned_to }. 댓글 작성자 요청자/담당자 라벨 표시 */
  taskIdToRole?: TaskIdToRoleMap | null
  /** 주기적으로 댓글 새로고침(ms). 0이면 폴링 안 함 */
  pollInterval?: number
  /** 현재 로그인 사용자 (id, role). 삭제 권한 판단에 사용 */
  me: { id: string; role?: string } | null
  /** 댓글 작성 가능 여부. false면 입력란 대신 안내 문구 표시 */
  allowWrite?: boolean
  /** 댓글 삭제 가능 여부. false면 삭제 버튼 숨김 (task 카드 안에서는 수정 불가) */
  allowDelete?: boolean
}

export function TaskCommentSection({
  taskId,
  taskIds: propTaskIds,
  taskIdToRole,
  pollInterval = 0,
  me,
  allowWrite = true,
  allowDelete = true,
}: TaskCommentSectionProps) {
  const [comments, setComments] = useState<CommentItem[]>([])
  const [newComment, setNewComment] = useState("")
  const [isPostingComment, setIsPostingComment] = useState(false)
  const { toast } = useToast()

  const effectiveTaskIds = propTaskIds?.length ? propTaskIds : taskId ? [taskId] : []
  const primaryTaskId = taskId ?? effectiveTaskIds[0] ?? null

  const loadComments = useCallback(async () => {
    if (effectiveTaskIds.length === 0) return
    try {
      const results = await Promise.all(
        effectiveTaskIds.map((id) =>
          fetch(`/api/tasks/${id}/comments`, { credentials: "include" }).then(async (res) => {
            if (!res.ok) return []
            const data = await res.json()
            const list = Array.isArray(data.comments) ? data.comments : []
            return list.map((c: CommentItem) => ({ ...c, task_id: id }))
          })
        )
      )
      const merged = results.flat().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      setComments(merged)
    } catch {
      // ignore
    }
  }, [effectiveTaskIds.join(",")])

  useEffect(() => {
    if (effectiveTaskIds.length === 0) return
    loadComments()
  }, [effectiveTaskIds.join(","), loadComments])

  useEffect(() => {
    if (pollInterval <= 0 || effectiveTaskIds.length === 0) return
    const t = setInterval(loadComments, pollInterval)
    return () => clearInterval(t)
  }, [pollInterval, effectiveTaskIds.join(","), loadComments])

  const handleDeleteComment = useCallback(
    async (commentId: string, commentTaskId?: string) => {
      const targetTaskId = commentTaskId ?? primaryTaskId
      if (!targetTaskId) return
      const ok = confirm("이 댓글을 삭제할까요?")
      if (!ok) return
      try {
        const res = await fetch(
          `/api/tasks/${targetTaskId}/comments?commentId=${encodeURIComponent(commentId)}`,
          { method: "DELETE", credentials: "include" }
        )
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || "댓글 삭제 실패")
        }
        await loadComments()
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "댓글을 삭제하는 중 오류가 발생했습니다."
        toast({
          title: "댓글 삭제 실패",
          description: message,
          variant: "destructive",
        })
      }
    },
    [primaryTaskId, loadComments, toast]
  )

  const handlePostComment = useCallback(async () => {
    if (!primaryTaskId) return
    const content = newComment.trim()
    if (!content) return
    setIsPostingComment(true)
    try {
      const res = await fetch(`/api/tasks/${primaryTaskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "댓글 저장 실패")
      }
      setNewComment("")
      await loadComments()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "댓글을 저장하는 중 오류가 발생했습니다."
      toast({
        title: "댓글 작성 실패",
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsPostingComment(false)
    }
  }, [primaryTaskId, newComment, loadComments, toast])

  if (!primaryTaskId) return null

  const userRole = me?.role ?? null
  const bubbleColors = [
    "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
    "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
    "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
    "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-200",
    "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200",
  ]

  return (
    <div
      className="mb-6 rounded-xl border bg-muted/20 overflow-hidden flex flex-col mt-8"
      style={{ minHeight: "280px" }}
    >
      <div className="flex-1 max-h-[320px] overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">아직 댓글이 없습니다.</p>
        ) : (
          comments.map((c, index) => {
            const canDelete =
              allowDelete && ((me?.id && c.user_id === me.id) || userRole === "admin" || userRole === "staff")
            const isMe = me?.id && c.user_id === me.id
            const userOrder = Array.from(new Set(comments.map((x) => x.user_id)))
            const userIndex = userOrder.indexOf(c.user_id)
            const bubbleClass = isMe
              ? "bg-primary text-primary-foreground"
              : bubbleColors[userIndex % bubbleColors.length]
            // 여러 task 댓글 합치거나 API 중복 시 동일 id가 올 수 있으므로 index 포함해 고유 key 보장
            const uniqueKey = `${c.task_id ?? primaryTaskId}-${c.id}-${index}`

            return (
              <div
                key={uniqueKey}
                className={`flex ${isMe ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`flex flex-col max-w-[85%] sm:max-w-[75%] ${isMe ? "items-end" : "items-start"}`}
                >
                  <div className="flex items-center gap-2 px-2 mb-1 flex-wrap">
                    <span className="text-[11px] font-medium text-foreground/90">
                      {c.full_name || "사용자"}
                    </span>
                    {taskIdToRole && c.task_id && (() => {
                      const role = taskIdToRole[c.task_id]
                      const isRequester = role?.assigned_by && c.user_id === role.assigned_by
                      const isAssignee = role?.assigned_to && c.user_id === role.assigned_to
                      if (isRequester) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">요청자</span>
                      if (isAssignee) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200">담당자</span>
                      return null
                    })()}
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(c.created_at).toLocaleString("ko-KR", {
                        year: "numeric",
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {canDelete && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="ml-auto h-6 w-6 shrink-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                        onClick={() => handleDeleteComment(c.id, c.task_id)}
                        title="댓글 삭제"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div
                    className={`rounded-2xl px-4 py-3 shadow-md ${bubbleClass}`}
                  >
                    <div className="text-sm wrap-break-word word-break break-all text-inherit [&_p]:my-0 [&_pre]:whitespace-pre-wrap [&_a]:underline">
                      <SafeHtml
                        html={c.content || ""}
                        className="prose prose-sm max-w-none prose-p:my-0 [&_table]:w-max [&_pre]:whitespace-pre-wrap [&_code]:break-all prose-inherit"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {allowWrite ? (
        <div className="border-t bg-background p-2 flex gap-2 items-end">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="댓글을 입력하세요..."
            className="min-h-[44px] max-h-[120px] resize-none py-3 px-4 rounded-2xl border-0 focus-visible:ring-2 bg-muted/50"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                if (newComment.trim()) handlePostComment()
              }
            }}
          />
          <Button
            size="icon"
            className="h-11 w-11 rounded-full shrink-0"
            onClick={handlePostComment}
            disabled={isPostingComment || newComment.trim().length === 0}
            title="전송"
          >
            {isPostingComment ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
      ) : (
        <div className="border-t bg-muted/30 p-4 text-center text-sm text-muted-foreground">
          댓글은 작업 진행 페이지에서만 작성할 수 있습니다
        </div>
      )}
    </div>
  )
}
