"use client"

import { useState, useEffect, useMemo } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import {
  FileText,
  CheckCircle2,
  Clock,
  Pause,
  AlertCircle,
  Check,
  Edit,
  Loader2,
  Trash2,
} from "lucide-react"
import { sanitizeHtml } from "@/lib/utils/sanitize"
import { SafeHtml } from "@/components/safe-html"
import { calculateFileExpiry, formatDateShort } from "@/lib/utils/dateHelpers"
import { downloadWithProgress } from "@/lib/utils/download-with-progress"
import { TaskCommentSection } from "./TaskCommentSection"
import { DueDateEditor } from "./DueDateEditor"
import { S3BucketInfoCard } from "@/components/s3-bucket-info-card"

export interface TaskDetailTask {
  id: string
  title: string
  subtitle?: string
  content: string | null
  comment?: string | null
  priority: "low" | "medium" | "high" | "urgent"
  status: string
  file_keys?: string[] | { key: string; uploaded_at?: string | null }[]
  comment_file_keys?: string[] | { key: string; uploaded_at?: string | null }[]
  created_at: string
  updated_at: string
  completed_at: string | null
  due_date?: string | null
  assigned_to?: string
  assigned_by?: string
  assigned_by_name?: string
  assigned_by_email?: string
  is_subtask?: boolean
  parent_task_id?: string
  task_id?: string
}

interface ResolvedFileKey {
  originalKey: string
  s3Key: string
  fileName: string
  uploadedAt?: string | null
  userId?: string | null
}

export interface TaskDetailDialogProps {
  task: TaskDetailTask | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onTaskUpdate?: () => void
  onEditTask?: (task: TaskDetailTask) => void
  finalizedTaskIds?: Set<string>
  setFinalizedTaskIds?: React.Dispatch<React.SetStateAction<Set<string>>>
  userRole?: string | null
  /** client progress에서만 태스크 제거 버튼 표시 */
  showDeleteTaskButton?: boolean
  /** 작업 끝내기 버튼 표시 (admin progress에서 담당자 본인일 때 false 전달) */
  showCompleteButton?: boolean
  /** progress 페이지에서 마감일 편집 표시 */
  showDueDateEditor?: boolean
}

function getPriorityColor(priority: TaskDetailTask["priority"]) {
  switch (priority) {
    case "urgent":
      return "bg-red-500 text-white"
    case "high":
      return "bg-orange-500 text-white"
    case "medium":
      return "bg-yellow-500 text-white"
    case "low":
      return "bg-blue-500 text-white"
    default:
      return "bg-gray-500 text-white"
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />
    case "awaiting_completion":
      return <CheckCircle2 className="h-4 w-4 text-purple-500" />
    case "in_progress":
      return <Clock className="h-4 w-4 text-blue-500" />
    case "on_hold":
      return <Pause className="h-4 w-4 text-yellow-500" />
    case "pending":
      return <AlertCircle className="h-4 w-4 text-gray-500" />
    default:
      return null
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case "completed":
      return "완료"
    case "awaiting_completion":
      return "완료대기"
    case "in_progress":
      return "작업"
    case "on_hold":
      return "보류"
    case "pending":
      return "대기"
    default:
      return status
  }
}

/** API 응답의 file_keys/comment_file_keys를 string[]로 통일 */
export function normalizeFileKeys(
  keys: string[] | { key: string; uploaded_at?: string | null }[] | undefined
): string[] {
  if (!keys?.length) return []
  return keys.map((k) => (typeof k === "string" ? k : (k as { key?: string })?.key ?? "")).filter(Boolean)
}

export function TaskDetailDialog({
  task,
  open,
  onOpenChange,
  onTaskUpdate,
  onEditTask,
  finalizedTaskIds,
  setFinalizedTaskIds,
  userRole: propUserRole,
  showDeleteTaskButton = false,
  showCompleteButton = true,
  showDueDateEditor = false,
}: TaskDetailDialogProps) {
  const { toast } = useToast()
  const [user, setUser] = useState<{ id: string; role?: string } | null>(null)
  const [userRole, setUserRole] = useState<string | null>(propUserRole ?? null)
  const [resolvedFileKeys, setResolvedFileKeys] = useState<ResolvedFileKey[]>([])
  const [commentResolvedFileKeys, setCommentResolvedFileKeys] = useState<
    ResolvedFileKey[]
  >([])
  const [subtasks, setSubtasks] = useState<any[]>([])
  const [showCompleteDialog, setShowCompleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteTaskDialog, setShowDeleteTaskDialog] = useState(false)
  const [isDeletingTask, setIsDeletingTask] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [downloadingFileName, setDownloadingFileName] = useState("")
  /** 캘린더 등에서 열 때 상세(comment, comment_file_keys 등) 로드용 */
  const [fullTask, setFullTask] = useState<TaskDetailTask | null>(null)
  /** task에 연결된 s3_update (있으면 버킷 정보 카드 표시) */
  const [s3Update, setS3Update] = useState<{
    id: number
    file_name: string
    bucket_name?: string | null
    file_size?: number | null
    upload_time?: string | null
    created_at: string
    s3_key: string
  } | null>(null)

  const mainTaskId = task ? (task.parent_task_id ?? task.task_id ?? task.id) : null
  const displayTask: TaskDetailTask | null = task
    ? (fullTask ?? { ...task, file_keys: normalizeFileKeys(task.file_keys), comment_file_keys: normalizeFileKeys(task.comment_file_keys) })
    : null

  useEffect(() => {
    if (propUserRole !== undefined) setUserRole(propUserRole)
  }, [propUserRole])

  useEffect(() => {
    if (!open || !mainTaskId) {
      setFullTask(null)
      setS3Update(null)
      return
    }
    let cancelled = false
    fetch(`/api/tasks/${mainTaskId}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (cancelled || !data?.task) return
        const t = data.task
        setFullTask({
          ...t,
          file_keys: normalizeFileKeys(t.file_keys),
          comment_file_keys: normalizeFileKeys(t.comment_file_keys),
        })
        if (data.s3Update) setS3Update(data.s3Update)
        else setS3Update(null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open, mainTaskId])

  useEffect(() => {
    const loadUser = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" })
        if (!res.ok) return
        const me = await res.json()
        setUser(me)
        if (propUserRole == null) setUserRole(me.role || null)
      } catch {
        // ignore
      }
    }
    loadUser()
  }, [propUserRole])

  useEffect(() => {
    if (!mainTaskId) return
    const load = async () => {
      try {
        const res = await fetch(`/api/tasks/${mainTaskId}/subtasks`, {
          credentials: "include",
        })
        if (!res.ok) return
        const data = await res.json()
        setSubtasks(Array.isArray(data.subtasks) ? data.subtasks : [])
      } catch {
        // ignore
      }
    }
    load()
  }, [mainTaskId])

  const displayFileKeys = displayTask ? normalizeFileKeys(displayTask.file_keys) : []
  const displayCommentFileKeys = displayTask ? normalizeFileKeys(displayTask.comment_file_keys) : []

  useEffect(() => {
    if (!displayTask?.id || !displayFileKeys.length) {
      setResolvedFileKeys([])
      return
    }
    let cancelled = false
    fetch("/api/storage/resolve-file-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ fileKeys: displayFileKeys }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setResolvedFileKeys(data.resolvedKeys || [])
      })
      .catch(() => {
        if (!cancelled) setResolvedFileKeys([])
      })
    return () => {
      cancelled = true
    }
  }, [displayTask?.id, fullTask?.id, displayFileKeys.length])

  useEffect(() => {
    if (!displayTask?.id || !displayCommentFileKeys.length) {
      setCommentResolvedFileKeys([])
      return
    }
    let cancelled = false
    fetch("/api/storage/resolve-file-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ fileKeys: displayCommentFileKeys }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setCommentResolvedFileKeys(data.resolvedKeys || [])
      })
      .catch(() => {
        if (!cancelled) setCommentResolvedFileKeys([])
      })
    return () => {
      cancelled = true
    }
  }, [displayTask?.id, fullTask?.id, displayCommentFileKeys.length])

  const allSubtasksCompleted = useMemo(
    () =>
      subtasks.length > 0 && subtasks.every((st: any) => st.status === "completed"),
    [subtasks]
  )

  // 댓글: 메인 기준 한 번만 요청하면 API가 메인+서브 전부 반환. 서브 선택 시에도 메인 id로 요청해야 메인 댓글 포함됨
  const commentMainTaskId = displayTask?.is_subtask ? (displayTask as any).task_id : displayTask?.id
  const commentTaskIds = useMemo(
    () => (commentMainTaskId ? [commentMainTaskId] : []),
    [commentMainTaskId]
  )
  const taskIdToRole = useMemo(() => {
    if (!displayTask) return {}
    const map: Record<string, { assigned_by?: string | null; assigned_to?: string | null }> = {
      [displayTask.id]: { assigned_by: displayTask.assigned_by, assigned_to: displayTask.assigned_to },
    }
    if (commentMainTaskId && (fullTask?.id === commentMainTaskId || displayTask.id === commentMainTaskId)) {
      const main = fullTask?.id === commentMainTaskId ? fullTask : displayTask
      if (main) map[commentMainTaskId] = { assigned_by: main.assigned_by, assigned_to: main.assigned_to }
    }
    subtasks.forEach((s: any) => {
      map[s.id] = { assigned_by: displayTask.assigned_by, assigned_to: s.assigned_to }
    })
    return map
  }, [displayTask?.id, displayTask?.assigned_by, displayTask?.assigned_to, subtasks, commentMainTaskId, fullTask?.id, fullTask?.assigned_by, fullTask?.assigned_to])

  const handleDownloadWithProgress = async (s3Key: string, name?: string) => {
    const fileName = name ?? s3Key.split("/").pop() ?? "download"
    setIsDownloading(true)
    setDownloadingFileName(fileName)
    setDownloadProgress(0)
    try {
      await downloadWithProgress({
        url: `/api/storage/download?path=${encodeURIComponent(s3Key)}`,
        fileName,
        withCredentials: true,
        onProgress: (p) => setDownloadProgress(p.percent),
      })
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "다운로드 중 오류가 발생했습니다."
      toast({
        title: "다운로드 실패",
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsDownloading(false)
      setDownloadingFileName("")
      setDownloadProgress(0)
    }
  }

  const handleCompleteTask = async () => {
    if (!displayTask || !onTaskUpdate) return
    setIsDeleting(true)
    try {
      const updateRes = await fetch(`/api/tasks/${displayTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "completed" }),
      })
      if (!updateRes.ok) {
        const err = await updateRes.json().catch(() => ({}))
        throw new Error(err.error || "작업 완료 처리 실패")
      }
      const reportRes = await fetch(`/api/tasks/${displayTask.id}/create-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      })
      if (!reportRes.ok) {
        const err = await reportRes.json().catch(() => ({}))
        console.warn("Report 생성 실패:", err)
      }
      toast({
        title: "완료 처리됨",
        description: "작업이 완료 처리되었고 Report가 저장되었습니다.",
      })
      setShowCompleteDialog(false)
      onTaskUpdate()
      if (setFinalizedTaskIds) setFinalizedTaskIds((prev) => new Set(prev).add(displayTask.id))
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "작업 완료 처리에 실패했습니다."
      toast({ title: "완료 처리 실패", description: message, variant: "destructive" })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDeleteTaskFromDB = async () => {
    if (!displayTask || !onTaskUpdate) return
    setIsDeletingTask(true)
    try {
      const res = await fetch(`/api/tasks/${displayTask.id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Task 삭제 실패")
      }
      toast({ title: "성공", description: "Task가 삭제되었습니다." })
      setShowDeleteTaskDialog(false)
      onOpenChange(false)
      onTaskUpdate()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Task 삭제에 실패했습니다."
      toast({ title: "오류", description: message, variant: "destructive" })
    } finally {
      setIsDeletingTask(false)
    }
  }

  if (!task || !displayTask) return null

  const isJointTask = subtasks.length > 0
  const comment = displayTask.comment
    ? displayTask.comment.startsWith("\n")
      ? displayTask.comment.substring(1)
      : displayTask.comment
    : ""

  const proseTableStyles = (
    <style jsx global>{`
      .task-detail-prose table {
        border-collapse: collapse;
        width: 100%;
        margin: 10px 0;
        border: 2px solid #6b7280;
      }
      .task-detail-prose table td,
      .task-detail-prose table th {
        border: 2px solid #6b7280;
        padding: 8px;
        cursor: default !important;
      }
      .task-detail-prose table td[contenteditable="true"],
      .task-detail-prose table th[contenteditable="true"] {
        pointer-events: none;
        user-select: none;
      }
      .task-detail-prose table td *,
      .task-detail-prose table th * {
        cursor: default !important;
        pointer-events: none;
      }
      .task-detail-prose hr {
        border: none;
        border-top: 2px solid #6b7280;
        margin: 10px 0;
      }
    `}</style>
  )

  const canComplete =
    (displayTask.status === "awaiting_completion" ||
      (subtasks.length > 0 && allSubtasksCompleted)) &&
    (user?.id === displayTask.assigned_by ||
      userRole === "admin" ||
      userRole === "staff")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[80vh] overflow-y-auto overflow-x-hidden"
        style={{
          width: "calc((1280px - 48px - 16px) * 7/10)",
          maxWidth: "851px",
        }}
      >
        <DialogHeader className="pr-8 pb-3">
          <div className="flex items-center gap-2 wrap-break-word word-break break-all">
            {getStatusIcon(displayTask.status)}
            <DialogTitle className="min-w-0">
              {displayTask.title}
              {displayTask.subtitle && displayTask.is_subtask && (
                <span className="text-muted-foreground text-sm ml-2">
                  ({displayTask.subtitle})
                </span>
              )}
            </DialogTitle>
            {showDeleteTaskButton && userRole !== "client" && (
              <Button
                type="button"
                onClick={() => setShowDeleteTaskDialog(true)}
                variant="ghost"
                size="sm"
                className="h-6 px-2 ml-auto shrink-0 cursor-pointer"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </DialogHeader>

        {s3Update && (
          <S3BucketInfoCard s3Update={s3Update} compact />
        )}

        <div className="flex items-center justify-between gap-4 pb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={getPriorityColor(displayTask.priority)}>
              {displayTask.priority === "urgent"
                ? "긴급"
                : displayTask.priority === "high"
                  ? "높음"
                  : displayTask.priority === "medium"
                    ? "보통"
                    : "낮음"}
            </Badge>
            <Badge variant="outline">{getStatusLabel(displayTask.status)}</Badge>
            <span className="text-xs text-muted-foreground">
              작업 요청자:{" "}
              <span className="font-medium text-foreground">
                {displayTask.assigned_by_name || displayTask.assigned_by_email}
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              {displayTask.due_date
                ? `시작일 ${formatDateShort(displayTask.created_at)} ~ 마감일 ${formatDateShort(displayTask.due_date)}`
                : `시작일 ${formatDateShort(displayTask.created_at)}`}
            </span>
          </div>
        </div>

        <div className="space-y-4 mt-4">
          {isDownloading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="truncate">다운로드 중: {downloadingFileName}</span>
                <span className="shrink-0">{downloadProgress}%</span>
              </div>
              <Progress value={downloadProgress} />
            </div>
          )}

          {showDueDateEditor && (userRole !== "client" || displayTask.completed_at) && (
            <div className="grid grid-cols-2 gap-4">
              {userRole !== "client" && (
                <div>
                  <p className="text-muted-foreground mb-1">마감일</p>
                  <DueDateEditor
                    taskId={displayTask.id}
                    dueDate={displayTask.due_date}
                    onUpdate={onTaskUpdate ?? (() => {})}
                    userRole={userRole}
                  />
                </div>
              )}
              {displayTask.completed_at && (
                <div>
                  <p className="text-muted-foreground">종료일</p>
                  <p className="font-medium">{formatDateShort(displayTask.completed_at)}</p>
                </div>
              )}
            </div>
          )}

          {/* 개별 업무: 요청자/담당자 내용 한 세트 */}
          {!isJointTask && (
            <>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">요청자 내용</Label>
                {displayTask.content ? (
                  <div
                    className="text-sm border rounded-md overflow-hidden bg-muted/30 wrap-break-word word-break break-all overflow-x-auto prose prose-sm max-w-none task-detail-prose"
                    style={{
                      minHeight: "120px",
                      maxHeight: "400px",
                      overflowY: "auto",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    <div
                      className="p-3"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(displayTask.content) }}
                    />
                  </div>
                ) : (
                  <div className="border rounded-md bg-muted/30 p-4 text-center text-muted-foreground min-h-[80px] flex items-center justify-center">
                    내용이 없습니다
                  </div>
                )}
                {displayTask.content && proseTableStyles}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">담당자 내용</Label>
                {comment ? (
                  <div
                    className="text-sm border rounded-md overflow-hidden bg-muted/30 wrap-break-word word-break break-all overflow-x-auto prose prose-sm max-w-none task-detail-prose"
                    style={{
                      minHeight: "120px",
                      maxHeight: "400px",
                      overflowY: "auto",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    <div
                      className="p-3"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(comment) }}
                    />
                  </div>
                ) : (
                  <div className="border rounded-md bg-muted/30 p-4 text-center text-muted-foreground min-h-[80px] flex items-center justify-center">
                    내용이 없습니다
                  </div>
                )}
                {comment && proseTableStyles}
              </div>
            </>
          )}

          {/* 개별 업무 전용: 요청자/담당자 첨부파일 (첨부가 있을 때만 표시) */}
          {!isJointTask && (displayFileKeys.length > 0 || displayCommentFileKeys.length > 0) && (
            <>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">요청자 첨부파일</Label>
                <div className="flex flex-wrap gap-2 p-2 border border-transparent rounded-md bg-transparent min-h-[52px]">
                  {resolvedFileKeys.length > 0 ? (
                    resolvedFileKeys.map((resolved, index) => {
                      const expiry = calculateFileExpiry(displayTask.created_at)
                      return (
                        <div
                          key={index}
                          className={`flex items-center gap-2 px-2 py-1 rounded border text-sm ${expiry.isExpired ? "bg-red-50 border-red-300 dark:bg-red-950/20 dark:border-red-800" : "bg-transparent"}`}
                        >
                          <FileText className={`h-4 w-4 shrink-0 ${expiry.isExpired ? "text-red-500" : "text-muted-foreground"}`} />
                          <button
                            type="button"
                            className={`text-left max-w-[200px] truncate ${expiry.isExpired ? "cursor-not-allowed text-red-600 dark:text-red-400 line-through" : "cursor-pointer hover:underline"}`}
                            onClick={() => {
                              if (expiry.isExpired) return
                              handleDownloadWithProgress(
                                resolved.s3Key,
                                resolved.fileName
                              )
                            }}
                            disabled={expiry.isExpired}
                          >
                            {resolved.fileName}
                          </button>
                          <span
                            className={`text-xs shrink-0 ${expiry.isExpired ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}`}
                          >
                            ({expiry.expiryText})
                          </span>
                        </div>
                      )
                    })
                  ) : !displayFileKeys.length ? (
                    <div className="w-full border rounded-md bg-muted/30 p-4 text-center text-muted-foreground min-h-[52px] flex items-center justify-center text-sm">
                      첨부파일이 없습니다
                    </div>
                  ) : (
                    <div className="w-full text-muted-foreground text-sm">
                      파일 정보를 불러오는 중...
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">담당자 첨부파일</Label>
                <div className="flex flex-wrap gap-2 p-2 border border-transparent rounded-md bg-transparent min-h-[52px]">
                  {commentResolvedFileKeys.length > 0 ? (
                    (() => {
                      const assigneeFileKeys = commentResolvedFileKeys.filter(
                        (r) => r.userId === displayTask.assigned_to
                      )
                      return assigneeFileKeys.length > 0 ? (
                        assigneeFileKeys.map((resolved, index) => {
                          const expiry = calculateFileExpiry(resolved.uploadedAt ?? null)
                          return (
                            <div
                              key={index}
                              role="button"
                              tabIndex={expiry.isExpired ? -1 : 0}
                              className={`flex items-center gap-2 px-2 py-1 rounded border text-sm ${expiry.isExpired ? "bg-red-50 border-red-300 dark:bg-red-950/20 dark:border-red-800 cursor-not-allowed" : "bg-transparent cursor-pointer"}`}
                              onClick={() => {
                                if (expiry.isExpired) return
                                handleDownloadWithProgress(
                                  resolved.s3Key,
                                  resolved.fileName
                                )
                              }}
                              onKeyDown={(e) => {
                                if (expiry.isExpired) return
                                if (e.key === "Enter")
                                  handleDownloadWithProgress(
                                    resolved.s3Key,
                                    resolved.fileName
                                  )
                              }}
                            >
                              <FileText className={`h-4 w-4 shrink-0 ${expiry.isExpired ? "text-red-500" : "text-muted-foreground"}`} />
                              <span className={`max-w-[200px] truncate ${expiry.isExpired ? "text-red-600 dark:text-red-400 line-through" : "hover:underline"}`}>
                                {resolved.fileName}
                              </span>
                              <span
                                className={`text-xs shrink-0 ${expiry.isExpired ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}`}
                              >
                                ({expiry.expiryText})
                              </span>
                            </div>
                          )
                        })
                      ) : (
                        <div className="w-full border rounded-md bg-muted/30 p-4 text-center text-muted-foreground min-h-[52px] flex items-center justify-center text-sm">
                          첨부파일이 없습니다
                        </div>
                      )
                    })()
                  ) : !displayCommentFileKeys.length ? (
                    <div className="w-full border rounded-md bg-muted/30 p-4 text-center text-muted-foreground min-h-[52px] flex items-center justify-center text-sm">
                      첨부파일이 없습니다
                    </div>
                  ) : (
                    <div className="w-full text-muted-foreground text-sm">
                      파일 정보를 불러오는 중...
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* 공동 업무 전용: 서브태스크 그룹별로 요청자 한 행 → 담당자들 한 행씩 표시 + 이름 표시 */}
          {isJointTask && (() => {
            const requesterName = displayTask?.assigned_by_name || displayTask?.assigned_by_email || "요청자"
            const groupedBySubtitle = (() => {
              const map = new Map<string, any[]>()
              for (const st of subtasks) {
                const key = st.subtitle || st.title || "서브태스크"
                if (!map.has(key)) map.set(key, [])
                map.get(key)!.push(st)
              }
              return Array.from(map.entries()).map(([subtitle, list]) => ({ subtitle, list }))
            })()
            return (
              <div className="space-y-4 pt-4 border-t">
                {groupedBySubtitle.map(({ subtitle, list }) => (
                  <div
                    key={subtitle}
                    className="rounded-lg border-2 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/30 p-3 space-y-3"
                  >
                    <p className="text-xs font-medium text-muted-foreground">
                      {subtitle}
                    </p>
                    <div className="space-y-3">
                      {/* 첫 행: 요청자 내용 */}
                      <div>
                        <p className="text-[11px] font-medium mb-1 inline-block px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">
                          {requesterName}
                        </p>
                        <div className="text-sm border rounded-md bg-muted/30 p-2 min-h-[60px] overflow-y-auto max-h-[200px]">
                          {(list[0]?.content ?? "") ? (
                            <div className="p-2 prose prose-sm max-w-none task-detail-prose" dangerouslySetInnerHTML={{ __html: sanitizeHtml(list[0].content ?? "") }} />
                          ) : (
                            <span className="text-muted-foreground">내용이 없습니다</span>
                          )}
                        </div>
                      </div>
                      {/* 다음 행들: 담당자별 내용 */}
                      {list.map((st: any) => {
                        const assigneeName = st.assigned_to_name || st.assigned_to_email || "담당자"
                        const stComment = st.comment
                          ? st.comment.startsWith("\n")
                            ? st.comment.substring(1)
                            : st.comment
                          : ""
                        return (
                          <div key={st.id}>
                            <p className="text-[11px] font-medium mb-1 inline-block px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                              {assigneeName}
                            </p>
                            <div className="text-sm border rounded-md bg-muted/30 p-2 min-h-[60px] overflow-y-auto max-h-[200px]">
                              {stComment ? (
                                <div className="p-2 prose prose-sm max-w-none task-detail-prose" dangerouslySetInnerHTML={{ __html: sanitizeHtml(stComment) }} />
                              ) : (
                                <span className="text-muted-foreground">내용이 없습니다</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}

              {(displayFileKeys.length > 0 || displayCommentFileKeys.length > 0) && (
              <div className="space-y-2 pt-2">
                <Label className="text-sm font-semibold">첨부파일</Label>
                <div className="flex flex-wrap gap-2 p-2 border border-transparent rounded-md bg-transparent min-h-[52px]">
                  {resolvedFileKeys.length > 0 || commentResolvedFileKeys.length > 0 ? (
                    <>
                      {resolvedFileKeys.map((resolved, index) => {
                        const expiry = calculateFileExpiry(displayTask.created_at)
                        return (
                          <div
                            key={`req-${index}`}
                            className={`flex items-center gap-2 px-2 py-1 rounded border text-sm ${expiry.isExpired ? "bg-red-50 border-red-300 dark:bg-red-950/20 dark:border-red-800" : "bg-transparent"}`}
                          >
                            <FileText className={`h-4 w-4 shrink-0 ${expiry.isExpired ? "text-red-500" : "text-muted-foreground"}`} />
                            <button
                              type="button"
                              className={`text-left max-w-[200px] truncate ${expiry.isExpired ? "cursor-not-allowed text-red-600 dark:text-red-400 line-through" : "cursor-pointer hover:underline"}`}
                              onClick={() => {
                                if (expiry.isExpired) return
                                handleDownloadWithProgress(resolved.s3Key, resolved.fileName)
                              }}
                              disabled={expiry.isExpired}
                            >
                              {resolved.fileName}
                            </button>
                            <span className={`text-xs shrink-0 ${expiry.isExpired ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}`}>
                              ({expiry.expiryText})
                            </span>
                          </div>
                        )
                      })}
                      {commentResolvedFileKeys.map((resolved, index) => {
                        const expiry = calculateFileExpiry(resolved.uploadedAt ?? null)
                        return (
                          <div
                            key={`cmt-${index}`}
                            role="button"
                            tabIndex={expiry.isExpired ? -1 : 0}
                            className={`flex items-center gap-2 px-2 py-1 rounded border text-sm ${expiry.isExpired ? "bg-red-50 border-red-300 dark:bg-red-950/20 dark:border-red-800 cursor-not-allowed" : "bg-transparent cursor-pointer"}`}
                            onClick={() => {
                              if (expiry.isExpired) return
                              handleDownloadWithProgress(resolved.s3Key, resolved.fileName)
                            }}
                            onKeyDown={(e) => {
                              if (expiry.isExpired) return
                              if (e.key === "Enter") handleDownloadWithProgress(resolved.s3Key, resolved.fileName)
                            }}
                          >
                            <FileText className={`h-4 w-4 shrink-0 ${expiry.isExpired ? "text-red-500" : "text-muted-foreground"}`} />
                            <span className={`max-w-[200px] truncate ${expiry.isExpired ? "text-red-600 dark:text-red-400 line-through" : "hover:underline"}`}>
                              {resolved.fileName}
                            </span>
                            <span className={`text-xs shrink-0 ${expiry.isExpired ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}`}>
                              ({expiry.expiryText})
                            </span>
                          </div>
                        )
                      })}
                    </>
                  ) : !displayFileKeys.length && !displayCommentFileKeys.length ? (
                    <div className="w-full border rounded-md bg-muted/30 p-4 text-center text-muted-foreground min-h-[52px] flex items-center justify-center text-sm">
                      첨부파일이 없습니다
                    </div>
                  ) : (
                    <div className="w-full text-muted-foreground text-sm">
                      파일 정보를 불러오는 중...
                    </div>
                  )}
                </div>
              </div>
              )}
            </div>
          )})()}

          <div className="pt-4 border-t">
            <TaskCommentSection
              taskId={commentMainTaskId ?? displayTask.id}
              taskIds={commentTaskIds}
              taskIdToRole={taskIdToRole}
              pollInterval={15000}
              me={user}
              allowWrite={false}
              allowDelete={false}
            />
          </div>
        </div>

        <div className="flex justify-end mt-4 pt-4 border-t gap-2">
          {onEditTask && displayTask.status !== "awaiting_completion" && (
            <Button
              type="button"
              onClick={() => onEditTask(displayTask)}
              variant="outline"
              className="gap-2 cursor-pointer"
            >
              <Edit className="h-4 w-4" />
              작성
            </Button>
          )}
          {canComplete && showCompleteButton && (
              <Button
                type="button"
                onClick={() => setShowCompleteDialog(true)}
                variant="default"
                className="gap-2 cursor-pointer"
              >
                <Check className="h-4 w-4" />
                작업 끝내기
              </Button>
            )}
        </div>

        <AlertDialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>작업을 끝내시겠습니까?</AlertDialogTitle>
              <AlertDialogDescription>
                이 작업을 완료 처리하고 Reports로 이동시킵니다. 되돌릴 수 없습니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>취소</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleCompleteTask}
                disabled={isDeleting}
                className="bg-green-600 hover:bg-green-700"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    처리 중...
                  </>
                ) : (
                  "확인"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {showDeleteTaskButton && (
          <AlertDialog
            open={showDeleteTaskDialog}
            onOpenChange={setShowDeleteTaskDialog}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>이 작업을 제거하시겠습니까?</AlertDialogTitle>
                <AlertDialogDescription>
                  작업이 목록에서 제거됩니다. 되돌릴 수 없습니다.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeletingTask}>
                  취소
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteTaskFromDB}
                  disabled={isDeletingTask}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {isDeletingTask ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      삭제 중...
                    </>
                  ) : (
                    "제거"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </DialogContent>
    </Dialog>
  )
}
