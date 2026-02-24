"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2, Download, Calendar as CalendarIcon, FileText, X, Send, Bold, Italic, Underline, Minus, Grid3x3 as TableIcon, Paperclip, Trash2, Sparkles } from "lucide-react"
import Link from "next/link"
import { SafeHtml } from "@/components/safe-html"
import { cn } from "@/lib/utils"
import { sanitizeHtml } from "@/lib/utils/sanitize"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { format } from "date-fns"
import { ko } from "date-fns/locale"
import { useToast } from "@/hooks/use-toast"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { downloadWithProgress } from "@/lib/utils/download-with-progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  normalizeFileKeyArray,
  extractFileName,
  resolveFileKeys,
  mapResolvedKeys,
  classifyFilesByUploader,
  resolveSubtaskFileKeys,
  type SubtaskFileKeyItem,
  type ResolvedFileKey,
  type ResolvedSubtaskFile,
} from "@/lib/utils/fileKeyHelpers"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getStatusBadge, getStatusColor, getStatusTextColor, getPriorityBadge } from "@/lib/utils/taskStatusHelpers"
import { parseDateOnly } from "@/lib/utils/dateHelpers"
import { FileListItem } from "./components/FileListItem"
import { StaffSessionBlock } from "./components/StaffSessionBlock"
import { S3BucketInfoCard } from "@/components/s3-bucket-info-card"
import { useSubtaskCompletion } from "@/lib/hooks/useSubtaskCompletion"
import { useContentEditor } from "@/lib/hooks/useContentEditor"
import type { Task, Subtask, S3UpdateForTask } from "@/lib/types"

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes === 0) return "-"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/** 담당자/요청자별 괄호 색상 (같은 이름이면 같은 색) */
const ASSIGNEE_COLOR_CLASSES = ["text-blue-600", "text-emerald-600", "text-violet-600", "text-amber-600", "text-rose-600", "text-cyan-600"]
function getAssigneeColorClass(name: string | undefined): string {
  if (!name) return "text-muted-foreground"
  let n = 0
  for (let i = 0; i < name.length; i++) n = (n * 31 + name.charCodeAt(i)) >>> 0
  return ASSIGNEE_COLOR_CLASSES[n % ASSIGNEE_COLOR_CLASSES.length]
}

export default function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [task, setTask] = useState<Task | null>(null)
  const [s3Update, setS3Update] = useState<S3UpdateForTask | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const [taskId, setTaskId] = useState<string | null>(null)
  const { toast } = useToast()
  const [me, setMe] = useState<any>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [selectedDueDate, setSelectedDueDate] = useState<Date | null>(null)
  const [isUpdatingDueDate, setIsUpdatingDueDate] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [isDuePopoverOpen, setIsDuePopoverOpen] = useState(false)
  const [resolvedFileKeys, setResolvedFileKeys] = useState<ResolvedFileKey[]>([])
  const [resolvedCommentFileKeys, setResolvedCommentFileKeys] = useState<ResolvedFileKey[]>([])
  const [resolvedSubtaskFileKeys, setResolvedSubtaskFileKeys] = useState<ResolvedSubtaskFile[]>([])
  const [isResolvingFiles, setIsResolvingFiles] = useState(false)
  const [isResolvingCommentFiles, setIsResolvingCommentFiles] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<number>(0)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadingFileName, setDownloadingFileName] = useState<string>("")
  const [isFinalizing, setIsFinalizing] = useState(false)
  const [comments, setComments] = useState<Array<{ id: string; content: string; created_at: string; user_id: string; full_name: string | null }>>([])
  const [newComment, setNewComment] = useState("")
  const [isPostingComment, setIsPostingComment] = useState(false)
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [selectedSubtask, setSelectedSubtask] = useState<Subtask | null>(null)
  /** 공동: 요청자 내용 수정 시 편집 대상 부제 */
  const [selectedSubtitle, setSelectedSubtitle] = useState<string | null>(null)
  /** 그룹별 선택된 담당자 블록 (분담내용에서 블록 선택 시) — subtitle -> subtask id */
  const [selectedSubtaskIdBySubtitle, setSelectedSubtaskIdBySubtitle] = useState<Record<string, string | null>>({})
  const [isLoadingSubtasks, setIsLoadingSubtasks] = useState(false)
  const [isEditingRequesterContent, setIsEditingRequesterContent] = useState(false)
  const [isSavingRequesterContent, setIsSavingRequesterContent] = useState(false)
  /** 개별 할당 시 요청자 수정 모드에서 편집 중인 제목·첨부키 (저장 시 한 번에 전송) */
  const [editingRequesterTitle, setEditingRequesterTitle] = useState("")
  const [editingRequesterFileKeys, setEditingRequesterFileKeys] = useState<string[]>([])
  const [isUploadingRequesterFile, setIsUploadingRequesterFile] = useState(false)
  const requesterFileInputRef = useRef<HTMLInputElement>(null)
  const didSetInitialRequesterContent = useRef(false)
  /** subtask별 첨부파일 수정 (한 번에 하나의 subtask만 편집) */
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null)
  const [editingSubtaskFileKeys, setEditingSubtaskFileKeys] = useState<string[]>([])
  const [editingSubtaskCommentFileKeys, setEditingSubtaskCommentFileKeys] = useState<string[]>([])
  const [isUploadingSubtaskFile, setIsUploadingSubtaskFile] = useState(false)
  const [isSavingSubtaskFiles, setIsSavingSubtaskFiles] = useState(false)
  const subtaskFileUploadTargetRef = useRef<'requester' | null>(null)
  const subtaskFileInputRef = useRef<HTMLInputElement>(null)
  /** 공동 업무 '첨부하기' 클릭 시 파일 선택 후 즉시 업로드·저장용 hidden input */
  const sharedAttachInputRef = useRef<HTMLInputElement>(null)
  const [isUploadingSharedAttach, setIsUploadingSharedAttach] = useState(false)
  /** 첨부하기 클릭 시 대상 그룹 (해당 그룹의 모든 서브태스크에 파일 추가) */
  const sharedAttachGroupRef = useRef<{ subtitle: string; tasks: Subtask[] } | null>(null)
  /** 서브 그룹 수정 모드: 편집 중인 그룹 부제 (해당 그룹에서 담당자별 내용·파일 추가/삭제) */
  const [editingGroupSubtitle, setEditingGroupSubtitle] = useState<string | null>(null)
  /** 그룹 수정 시 subtask별 편집 중인 값 (comment, file_keys, comment_file_keys) */
  const [editingGroupData, setEditingGroupData] = useState<Record<string, { comment: string; file_keys: string[]; comment_file_keys: string[] }>>({})
  const [isSavingGroupEdit, setIsSavingGroupEdit] = useState(false)
  const [isUploadingGroupEditFile, setIsUploadingGroupEditFile] = useState(false)
  /** 그룹 수정 모드에서 파일 추가 대상: 해당 subtask의 요청자 첨부만 (담당자 첨부는 수정 불가) */
  const groupEditFileTargetRef = useRef<{ type: "requester"; subtaskId: string } | null>(null)
  const groupEditFileInputRef = useRef<HTMLInputElement>(null)
  /** 그룹 수정 시 분담내용 에디터 초기값 설정 여부 (한 번만 설정해 커서 유지) */
  const didSetGroupEditCommentRef = useRef<Set<string>>(new Set())
  /** 그룹별 방금 첨부한 키 목록 — 요청자 첨부에 New 뱃지 표시용 */
  const [newAttachedKeysPerGroup, setNewAttachedKeysPerGroup] = useState<Record<string, string[]>>({})
  /** 그룹별 NEW 뱃지 표시 종료 시각(ms) — 등록 후 +2일까지만 표시, localStorage에 보존 */
  const [newBadgeUntilBySubtitle, setNewBadgeUntilBySubtitle] = useState<Record<string, number>>({})
  const NEW_BADGE_DAYS = 2
  const NEW_BADGE_MS = NEW_BADGE_DAYS * 24 * 60 * 60 * 1000
  /** 완료대기 → 대기 되돌리기 진행 중인 서브태스크 id */
  const [revertingSubtaskId, setRevertingSubtaskId] = useState<string | null>(null)
  /** 메인 테스크 완료대기 → 대기 되돌리기 진행 중 */
  const [revertingMainTaskToPending, setRevertingMainTaskToPending] = useState(false)
  const taskRef = useRef<Task | null>(null)
  useEffect(() => {
    taskRef.current = task
  }, [task])
  /** 공동 수정 시 에디터에 마지막으로 로드한 소스(부제) 추적 — 부제 전환 시 에디터 내용 갱신용 */
  const lastRequesterContentSourceRef = useRef<{ taskId: string; subtitle: string | null } | null>(null)
  /** 공동: 수정 버튼 클릭 시점에 편집 대상 부제를 동기 저장 — 상태 배칭 전에도 올바른 부제 매핑 보장 */
  const editingSubtitleRef = useRef<string | null>(null)
  /** 공동: 상단 요청자 내용에서 보여줄 그룹 부제 (null이면 첫 그룹) */
  const [requesterContentGroupSubtitle, setRequesterContentGroupSubtitle] = useState<string | null>(null)
  /** 공동: 요청자 내용 카드에서 "담당업무 표시" 선택 시 true → 내가 작성한 분담내용 표시 */
  const [showMyAssignment, setShowMyAssignment] = useState(false)
  const [isEditingMyComment, setIsEditingMyComment] = useState(false)
  const [isSavingMyComment, setIsSavingMyComment] = useState(false)
  const didSetMyCommentEditorRef = useRef(false)

  // 서브태스크 완료 처리 hook
  const { completeSubtask, isCompleting: isCompletingSubtask } = useSubtaskCompletion({
    onSuccess: () => {
      loadSubtasks()
      reloadTask()
    }
  })

  // 요청자 내용 편집용 서식 툴바 (굵게/기울임/밑줄/테이블/구분선)
  const {
    editorState: requesterEditorState,
    updateEditorState: updateRequesterEditorState,
    tableGridHover: requesterTableGridHover,
    setTableGridHover: setRequesterTableGridHover,
    createTable: createRequesterTable,
    addResizeHandlersToTable: addResizeHandlersToRequesterTable,
  } = useContentEditor({ editorId: "requester-content-editor", onContentChange: () => {} })

  // 그룹 수정(분담내용) 편집용 서식 툴바 (굵게/기울임/밑줄/테이블/구분선)
  const groupEditEditorId =
    editingGroupSubtitle && Object.keys(editingGroupData).length > 0
      ? `group-edit-comment-${Object.keys(editingGroupData)[0]}`
      : "group-edit-comment-placeholder"
  const {
    editorState: groupEditEditorState,
    updateEditorState: updateGroupEditEditorState,
    tableGridHover: groupEditTableGridHover,
    setTableGridHover: setGroupEditTableGridHover,
    createTable: createGroupEditTable,
    addResizeHandlersToTable: addResizeHandlersToGroupEditTable,
  } = useContentEditor({ editorId: groupEditEditorId, onContentChange: () => {} })

  useEffect(() => {
    params.then((p) => {
      setTaskId(p.id)
    })
  }, [params])

  // NEW 뱃지(2일): taskId 변경 시 localStorage에서 복원, 만료된 항목 제거
  useEffect(() => {
    if (!taskId) return
    try {
      const raw = localStorage.getItem(`task_new_badge_${taskId}`)
      if (!raw) return
      const parsed = JSON.parse(raw) as Record<string, number>
      const now = Date.now()
      const filtered: Record<string, number> = {}
      for (const [subtitle, until] of Object.entries(parsed)) {
        if (until > now) filtered[subtitle] = until
      }
      if (Object.keys(filtered).length > 0) setNewBadgeUntilBySubtitle((prev) => ({ ...prev, ...filtered }))
    } catch {
      // ignore
    }
  }, [taskId])

  // 현재 사용자 역할 로드 (staff/admin만 완료 처리 버튼 노출)
  useEffect(() => {
    const loadMe = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" })
        if (res.ok) {
          const me = await res.json()
          setMe(me)
          setUserRole(me.role || null)
        }
      } catch {
        // ignore
      }
    }
    loadMe()
  }, [])

  useEffect(() => {
    if (!taskId) return

    const loadTask = async () => {
      setIsLoading(true)
      try {
        const response = await fetch(`/api/tasks/${taskId}`, {
          credentials: "include",
        })

        if (!response.ok) {
          if (response.status === 404) {
            toast({
              title: "업무를 찾을 수 없습니다",
              description: "삭제되었거나 잘못된 링크일 수 있습니다.",
              variant: "destructive",
            })
            router.push("/admin/cases")
            return
          }
          throw new Error("Failed to load task")
        }

        const data = await response.json()
        setTask(data.task)
        setS3Update(data.s3Update ?? null)
        setSelectedDueDate(parseDateOnly(data.task.due_date) ?? null)
      } catch (error) {
        console.error("Failed to load task:", error)
        router.push("/admin/cases")
      } finally {
        setIsLoading(false)
      }
    }

    loadTask()
  }, [taskId, router, toast])

  // 첨부파일 resolve + 업로더 기준으로 분리(기존 데이터에서 file_keys에 섞여 있는 사용자 파일도 분리)
  useEffect(() => {
    const run = async () => {
      // API가 { key, uploaded_at }[] 형태로 줄 수 있으므로 string[]로 정규화
      const fileKeys = normalizeFileKeyArray(task?.file_keys)
      const commentKeys = normalizeFileKeyArray(task?.comment_file_keys)

      if (fileKeys.length === 0 && commentKeys.length === 0) {
        setResolvedFileKeys([])
        setResolvedCommentFileKeys([])
        return
      }

      // task_file_attachments에서 온 uploaded_at 맵 (만료 계산 안정화)
      const taskRequesterUploadedAt = new Map<string, string | null>()
      const taskCommentUploadedAt = new Map<string, string | null>()
      ;(task?.file_keys || []).forEach((f: unknown) => {
        const o = f as { key?: string; uploaded_at?: string | null }
        const k = typeof o === "object" && o?.key != null ? o.key : String(f)
        if (k) taskRequesterUploadedAt.set(k, o.uploaded_at ?? null)
      })
      ;(task?.comment_file_keys || []).forEach((f: unknown) => {
        const o = f as { key?: string; uploaded_at?: string | null }
        const k = typeof o === "object" && o?.key != null ? o.key : String(f)
        if (k) taskCommentUploadedAt.set(k, o.uploaded_at ?? null)
      })
      const applyTaskUploadedAt = (list: ResolvedFileKey[], isRequester: boolean) =>
        list.map((item) => {
          const fromTask = isRequester ? taskRequesterUploadedAt.get(item.s3Key) : taskCommentUploadedAt.get(item.s3Key)
          const uploadedAt = fromTask !== undefined ? fromTask : item.uploadedAt
          return uploadedAt !== item.uploadedAt ? { ...item, uploadedAt } : item
        })

      const allKeys = Array.from(new Set([...fileKeys, ...commentKeys]))
      setIsResolvingFiles(true)
      setIsResolvingCommentFiles(true)
      
      try {
        const res = await fetch("/api/storage/resolve-file-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ fileKeys: allKeys }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || "첨부파일 정보를 불러오지 못했습니다.")
        }

        const data = await res.json()
        const resolvedKeys = Array.isArray(data.resolvedKeys) ? data.resolvedKeys : []
        
        // API 응답을 Map으로 변환
        const resolvedKeyMap = mapResolvedKeys(resolvedKeys)
        
        // 파일 분류
        const { adminFiles, userFiles } = classifyFilesByUploader({
          allKeys,
          resolvedKeyMap,
          clientId: (task as any)?.assigned_to || null,
          preferUserKeys: commentKeys,
        })

        setResolvedFileKeys(applyTaskUploadedAt(adminFiles, true))
        setResolvedCommentFileKeys(applyTaskUploadedAt(userFiles, false))
      } catch {
        // fallback: 원본 배열 기준으로만 분리 + task의 uploaded_at 적용
        setResolvedFileKeys(applyTaskUploadedAt(resolveFileKeys(fileKeys), true))
        setResolvedCommentFileKeys(applyTaskUploadedAt(resolveFileKeys(commentKeys), false))
      } finally {
        setIsResolvingFiles(false)
        setIsResolvingCommentFiles(false)
      }
    }

    run()
  }, [task?.file_keys, task?.comment_file_keys, task?.assigned_to])

  const handleDownload = useCallback(async (s3Key: string, fileName?: string) => {
    try {
      const name = fileName || extractFileName(s3Key, "download")
      setIsDownloading(true)
      setDownloadingFileName(name)
      setDownloadProgress(0)
      await downloadWithProgress({
        url: `/api/storage/download?path=${encodeURIComponent(s3Key)}`,
        fileName: name,
        withCredentials: true,
        onProgress: (p) => setDownloadProgress(p.percent),
      })
    } catch (e: any) {
      toast({
        title: "다운로드 실패",
        description: e?.message || "다운로드 중 오류가 발생했습니다.",
        variant: "destructive",
      })
    } finally {
      setIsDownloading(false)
      setDownloadingFileName("")
      setDownloadProgress(0)
    }
  }, [toast])

  /** S3 연결 건: presigned(s3_key)는 버킷 카드에서만 다운로드 → 첨부파일 목록에서는 제외 */
  const resolvedFileKeysForDisplay = useMemo(() => {
    if (!s3Update?.s3_key) return resolvedFileKeys
    return resolvedFileKeys.filter((f) => f.s3Key !== s3Update.s3_key)
  }, [resolvedFileKeys, s3Update?.s3_key])

  const reloadTask = useCallback(async () => {
    if (!taskId) return
    const res = await fetch(`/api/tasks/${taskId}`, { credentials: "include" })
    if (res.ok) {
      const data = await res.json()
      setTask(data.task)
    }
  }, [taskId])

  // 수정 모드 종료 시 초기화 플래그 리셋 (의존성 배열 길이 고정을 위해 별도 effect)
  useEffect(() => {
    if (!isEditingRequesterContent) {
      didSetInitialRequesterContent.current = false
      lastRequesterContentSourceRef.current = null
    }
  }, [isEditingRequesterContent])

  const loadComments = useCallback(async () => {
    if (!taskId) return
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, { credentials: "include" })
      if (!res.ok) return
      const data = await res.json()
      const list = Array.isArray(data.comments) ? data.comments : []
      const seen = new Set<string>()
      const deduped = list.filter((c: { id?: string }) => {
        const id = c?.id
        if (!id || seen.has(id)) return false
        seen.add(id)
        return true
      })
      setComments(deduped)
    } catch {
      // ignore
    }
  }, [taskId])

  const handleDeleteComment = useCallback(async (commentId: string) => {
    if (!taskId) return
    const ok = confirm("이 댓글을 삭제할까요?")
    if (!ok) return
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments?commentId=${encodeURIComponent(commentId)}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "댓글 삭제 실패")
      }
      await loadComments()
    } catch (e: any) {
      toast({
        title: "댓글 삭제 실패",
        description: e?.message || "댓글을 삭제하는 중 오류가 발생했습니다.",
        variant: "destructive",
      })
    }
  }, [taskId, loadComments, toast])

  useEffect(() => {
    if (!taskId) return
    loadComments()
  }, [taskId, loadComments])

  // 서브태스크 로드
  const loadSubtasks = useCallback(async () => {
    if (!taskId) return
    setIsLoadingSubtasks(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}/subtasks`, { credentials: "include" })
      if (!res.ok) return
      const data = await res.json()
      setSubtasks(Array.isArray(data.subtasks) ? data.subtasks : [])
    } catch {
      // ignore
    } finally {
      setIsLoadingSubtasks(false)
    }
  }, [taskId])

  // 공동 업무일 때만 subtasks 요청 (개별 = main task만, 공동 = main task + subtasks)
  useEffect(() => {
    if (!taskId || !task || !task.is_multi_assign) return
    loadSubtasks()
  }, [taskId, task, loadSubtasks])

  type TaskStatusType = "pending" | "in_progress" | "on_hold" | "awaiting_completion" | "completed"
  const handleStatusChange = useCallback(
    async (id: string, newStatus: TaskStatusType) => {
      setIsUpdatingStatus(true)
      try {
        const res = await fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: newStatus }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || "상태 업데이트 실패")
        }
        await reloadTask()
        if (task?.is_multi_assign) await loadSubtasks()
        if (taskId) {
          window.dispatchEvent(new CustomEvent("task-content-updated", { detail: { taskId } }))
        }
        toast({ title: "상태가 변경되었습니다." })
        router.refresh()
      } catch (e: any) {
        toast({
          title: "상태 변경 실패",
          description: e?.message || "상태를 변경하는 중 오류가 발생했습니다.",
          variant: "destructive",
        })
      } finally {
        setIsUpdatingStatus(false)
      }
    },
    [taskId, task?.is_multi_assign, reloadTask, loadSubtasks, toast, router]
  )

  /** 완료대기 상태인 서브태스크를 대기로 되돌리기 (관리자/요청자만, 완료대기일 때만) */
  const handleRevertSubtaskToPending = useCallback(
    async (subtaskId: string) => {
      if (!confirm("대기 상태로 되돌리시겠습니까? 담당자 업무가 다시 대기 목록에 올라갑니다.")) return
      setRevertingSubtaskId(subtaskId)
      try {
        const res = await fetch(`/api/tasks/${subtaskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "pending" }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || "상태 업데이트 실패")
        }
        await loadSubtasks()
        await reloadTask()
        if (taskId) {
          window.dispatchEvent(new CustomEvent("task-content-updated", { detail: { taskId } }))
        }
        toast({ title: "담당자 업무가 대기 상태로 되돌아갔습니다." })
        router.refresh()
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "상태를 변경하는 중 오류가 발생했습니다."
        toast({
          title: "되돌리기 실패",
          description: message,
          variant: "destructive",
        })
      } finally {
        setRevertingSubtaskId(null)
      }
    },
    [taskId, loadSubtasks, reloadTask, toast, router]
  )

  /** 완료대기 상태인 메인 테스크를 대기로 되돌리기 (공동 서브태스크와 동일 로직) */
  const handleRevertMainTaskToPending = useCallback(
    async () => {
      if (!taskId) return
      if (!confirm("대기 상태로 되돌리시겠습니까? 업무가 다시 대기 목록에 올라갑니다.")) return
      setRevertingMainTaskToPending(true)
      try {
        const res = await fetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "pending" }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || "상태 업데이트 실패")
        }
        await reloadTask()
        if (task?.is_multi_assign) await loadSubtasks()
        window.dispatchEvent(new CustomEvent("task-content-updated", { detail: { taskId } }))
        toast({ title: "업무가 대기 상태로 되돌아갔습니다." })
        router.refresh()
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "상태를 변경하는 중 오류가 발생했습니다."
        toast({
          title: "되돌리기 실패",
          description: message,
          variant: "destructive",
        })
      } finally {
        setRevertingMainTaskToPending(false)
      }
    },
    [taskId, task?.is_multi_assign, reloadTask, loadSubtasks, toast, router]
  )

  // subtask 첨부파일 resolve (task_file_attachments의 uploaded_at 우선 사용) — 요청자(file_keys) + 담당자(comment_file_keys)
  useEffect(() => {
    const run = async () => {
      const subtaskFileKeys: SubtaskFileKeyItem[] = []
      const subtaskUploadedAt = new Map<string, string | null>() // "subtaskId:key" -> uploaded_at
      
      subtasks.forEach((subtask) => {
        const fileKeys = normalizeFileKeyArray(subtask.file_keys)
        const commentKeys = normalizeFileKeyArray(subtask.comment_file_keys)
        ;(subtask.file_keys || []).forEach((f: unknown) => {
          const o = f as { key?: string; uploaded_at?: string | null }
          const k = typeof o === "object" && o?.key != null ? o.key : String(f)
          if (k) subtaskUploadedAt.set(`${subtask.id}:${k}`, o.uploaded_at ?? null)
        })
        ;(subtask.comment_file_keys || []).forEach((f: unknown) => {
          const o = f as { key?: string; uploaded_at?: string | null }
          const k = typeof o === "object" && o?.key != null ? o.key : String(f)
          if (k) subtaskUploadedAt.set(`${subtask.id}:${k}`, o.uploaded_at ?? null)
        })
        fileKeys.forEach((key) => {
          subtaskFileKeys.push({
            key,
            subtaskId: subtask.id,
            assignedToName: "요청자"
          })
        })
        if (commentKeys.length > 0) {
          commentKeys.forEach((key) => {
            subtaskFileKeys.push({
              key,
              subtaskId: subtask.id,
              assignedToName: subtask.assigned_to_name || subtask.assigned_to_email || "담당자"
            })
          })
        }
      })

      if (subtaskFileKeys.length === 0) {
        setResolvedSubtaskFileKeys([])
        return
      }

      try {
        const allKeys = subtaskFileKeys.map(item => item.key)
        const res = await fetch("/api/storage/resolve-file-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ fileKeys: allKeys }),
        })

        if (!res.ok) {
          throw new Error("subtask 첨부파일 정보를 불러오지 못했습니다.")
        }

        const data = await res.json()
        const resolvedKeys = Array.isArray(data.resolvedKeys) ? data.resolvedKeys : []
        
        const resolvedKeyMap = new Map<string, { s3Key: string; fileName: string; uploadedAt?: string | null }>()
        resolvedKeys.forEach((k: any) => {
          if (typeof k === "object" && k !== null && "originalKey" in k) {
            resolvedKeyMap.set(String(k.originalKey), {
              s3Key: k.s3Key,
              fileName: k.fileName,
              uploadedAt: k.uploadedAt ?? null
            })
          }
        })
        
        let resolved = resolveSubtaskFileKeys(subtaskFileKeys, resolvedKeyMap)
        resolved = resolved.map((r) => {
          const fromTable = subtaskUploadedAt.get(`${r.subtaskId}:${r.s3Key}`)
          const uploadedAt = fromTable !== undefined ? fromTable : r.uploadedAt
          return uploadedAt !== r.uploadedAt ? { ...r, uploadedAt } : r
        })
        setResolvedSubtaskFileKeys(resolved)
      } catch (error) {
        console.error("subtask 첨부파일 resolve 오류:", error)
        setResolvedSubtaskFileKeys([])
      }
    }

    run()
  }, [subtasks])

  // 서브태스크를 subtitle(작업명)별로 그룹화
  const groupedSubtasks = useMemo(() => {
    const groups = new Map<string, Subtask[]>()
    subtasks.forEach((subtask) => {
      const key = subtask.subtitle
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(subtask)
    })
    return Array.from(groups.entries()).map(([subtitle, tasks]) => ({
      subtitle,
      tasks,
    }))
  }, [subtasks])

  // 공동: 상단 요청자 내용 그룹 선택이 유효하도록 (그룹 목록 변경 시 첫 그룹으로 보정)
  useEffect(() => {
    if (groupedSubtasks.length === 0) return
    const exists = groupedSubtasks.some((g) => g.subtitle === requesterContentGroupSubtitle)
    if (!requesterContentGroupSubtitle || !exists) setRequesterContentGroupSubtitle(groupedSubtasks[0].subtitle)
  }, [groupedSubtasks, requesterContentGroupSubtitle])

  /** 공동: 현재 로그인 사용자에게 할당된 subtask 목록 (담당업무 표시용) */
  const mySubtasks = useMemo(
    () => (me?.id ? subtasks.filter((st) => st.assigned_to === me.id) : []),
    [subtasks, me?.id]
  )
  const mySubtaskForComment = mySubtasks[0] ?? null

  // 담당업무 표시 시 분담내용에서 본인(me.id) subtask 블록 자동 선택
  useEffect(() => {
    if (!showMyAssignment || !me?.id || subtasks.length === 0) return
    const mySt = subtasks.find((st) => st.assigned_to === me.id)
    if (mySt) {
      setSelectedSubtask(mySt)
      setSelectedSubtitle(mySt.subtitle)
    }
  }, [showMyAssignment, me?.id, subtasks])

  // 내 담당업무 편집 시 에디터에 초기값 한 번만 설정
  useEffect(() => {
    if (!isEditingMyComment || !mySubtaskForComment) {
      didSetMyCommentEditorRef.current = false
      return
    }
    const t = setTimeout(() => {
      const el = document.getElementById("my-comment-editor") as HTMLElement | null
      if (!el || didSetMyCommentEditorRef.current) return
      const raw = mySubtaskForComment.comment ?? ""
      const commentDisplay = raw.startsWith("\n") ? raw.substring(1) : raw
      el.innerHTML = sanitizeHtml(commentDisplay)
      didSetMyCommentEditorRef.current = true
    }, 0)
    return () => clearTimeout(t)
  }, [isEditingMyComment, mySubtaskForComment?.id])

  /** 공동: 내 담당업무(분담내용) 저장 — subtask comment PATCH */
  const handleSaveMyComment = useCallback(async () => {
    if (!mySubtaskForComment) return
    const el = document.getElementById("my-comment-editor") as HTMLElement | null
    if (!el) return
    const raw = el.innerHTML || ""
    const comment = sanitizeHtml(raw.trim() ? raw : "")
    setIsSavingMyComment(true)
    try {
      const res = await fetch(`/api/tasks/${mySubtaskForComment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ comment, is_subtask: true }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "분담내용 저장 실패")
      }
      toast({ title: "저장됨", description: "내 담당업무 내용이 저장되었습니다." })
      if (task?.is_multi_assign) await loadSubtasks()
      setIsEditingMyComment(false)
      if (taskId) {
        window.dispatchEvent(new CustomEvent("task-content-updated", { detail: { taskId } }))
      }
      router.refresh()
    } catch (e: any) {
      toast({
        title: "저장 실패",
        description: e?.message || "분담내용을 저장하는 중 오류가 발생했습니다.",
        variant: "destructive",
      })
    } finally {
      setIsSavingMyComment(false)
    }
  }, [mySubtaskForComment, taskId, task?.is_multi_assign, loadSubtasks, toast, router])

  // 요청자 내용 편집 시 에디터에 초기값 설정 (개별: task.content, 공동: 선택/기본 부제의 첫 서브태스크 content) + 테이블 리사이즈
  // 공동 업무 시 수정 버튼 클릭 직후에도 올바른 부제 매핑을 위해 editingSubtitleRef 사용
  useEffect(() => {
    if (!isEditingRequesterContent || !task) return
    const t = setTimeout(() => {
      const el = document.getElementById("requester-content-editor") as HTMLElement | null
      if (!el) return
      const isJoint = subtasks.length > 0
      const effectiveSubtitle = isJoint
        ? (selectedSubtitle ?? editingSubtitleRef.current ?? groupedSubtasks[0]?.subtitle ?? null)
        : null
      const contentToLoad = effectiveSubtitle
        ? (groupedSubtasks.find((g) => g.subtitle === effectiveSubtitle)?.tasks[0]?.content ?? "")
        : (task.content ?? "")
      const sourceKey = { taskId: task.id, subtitle: effectiveSubtitle }
      const prev = lastRequesterContentSourceRef.current
      if (prev?.taskId !== sourceKey.taskId || prev?.subtitle !== sourceKey.subtitle) {
        lastRequesterContentSourceRef.current = sourceKey
        el.innerHTML = contentToLoad
        didSetInitialRequesterContent.current = true
      }
      el.querySelectorAll("table").forEach((table) => {
        addResizeHandlersToRequesterTable(table as HTMLTableElement)
      })
    }, 0)
    return () => clearTimeout(t)
  }, [isEditingRequesterContent, task?.id, task?.content, subtasks.length, selectedSubtitle, groupedSubtasks, addResizeHandlersToRequesterTable])

  const handleSaveRequesterContent = useCallback(async () => {
    if (!taskId || !task) return
    const el = document.getElementById("requester-content-editor") as HTMLElement | null
    if (!el) return
    const raw = el.innerHTML || ""
    const content = sanitizeHtml(raw.trim() ? raw : "")
    setIsSavingRequesterContent(true)
    try {
      if (subtasks.length > 0) {
        const effectiveSubtitle = selectedSubtitle ?? editingSubtitleRef.current ?? groupedSubtasks[0]?.subtitle ?? null
        const group = effectiveSubtitle ? groupedSubtasks.find((g) => g.subtitle === effectiveSubtitle) : groupedSubtasks[0]
        if (!group) {
          toast({ title: "저장 실패", description: "선택된 부제를 찾을 수 없습니다.", variant: "destructive" })
          return
        }
        // 공동 할당: 요청자 수정은 내용만 반영, 메인 task의 기존 첨부파일 유지
        const mainPayload: Record<string, unknown> = { file_keys: task?.file_keys ?? [] }
        const mainRes = await fetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(mainPayload),
        })
        if (!mainRes.ok) {
          const err = await mainRes.json().catch(() => ({}))
          throw new Error(err.error || "첨부파일 저장 실패")
        }
        for (const st of group.tasks) {
          const res = await fetch(`/api/tasks/${st.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ content, is_subtask: true }),
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.error || "요청자 내용 저장 실패")
          }
        }
      } else {
        const payload: Record<string, unknown> = { content }
        payload.title = task?.title ?? ""
        payload.due_date = task?.due_date ? format(parseDateOnly(task.due_date)!, "yyyy-MM-dd") : null
        payload.file_keys = editingRequesterFileKeys
        const res = await fetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || "요청자 내용 저장 실패")
        }
      }
      toast({ title: "저장됨", description: "요청자 내용이 저장되었습니다." })
      await reloadTask()
      if (task?.is_multi_assign) await loadSubtasks()
      setEditingRequesterTitle("")
      setEditingRequesterFileKeys([])
      editingSubtitleRef.current = null
      setIsEditingRequesterContent(false)
      window.dispatchEvent(new CustomEvent("task-content-updated", { detail: { taskId } }))
      router.refresh()
    } catch (e: any) {
      toast({
        title: "저장 실패",
        description: e?.message || "요청자 내용을 저장하는 중 오류가 발생했습니다.",
        variant: "destructive",
      })
    } finally {
      setIsSavingRequesterContent(false)
    }
  }, [taskId, task, subtasks.length, selectedSubtitle, groupedSubtasks, editingRequesterTitle, editingRequesterFileKeys, selectedDueDate, reloadTask, loadSubtasks, toast])

  // 실제 resolve된 담당자 첨부파일이 있는 subtaskId 집합 (아이콘은 이 기준으로만 표시)
  const subtaskIdsWithResolvedFiles = useMemo(() => {
    const set = new Set<string>()
    resolvedSubtaskFileKeys.forEach((f) => set.add(f.subtaskId))
    return set
  }, [resolvedSubtaskFileKeys])

  const applyDueDate = useCallback(async (next: Date | null): Promise<boolean> => {
    if (!taskId) return false
    try {
      setIsUpdatingDueDate(true)
      const dueDateValue = next ? format(next, "yyyy-MM-dd") : null
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ due_date: dueDateValue }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "마감일 업데이트 실패")
      }

      toast({
        title: dueDateValue ? "마감일이 적용되었습니다" : "마감일이 제거되었습니다",
        description: dueDateValue ? format(next as Date, "yyyy년 MM월 dd일", { locale: ko }) : undefined,
      })

      await reloadTask()
      return true
    } catch (error: any) {
      toast({
        title: "마감일 업데이트 실패",
        description: error.message || "마감일을 업데이트하는 중 오류가 발생했습니다.",
        variant: "destructive",
      })
      // 실패 시 원래 값으로 복원
      setSelectedDueDate(parseDateOnly(task?.due_date) ?? null)
      return false
    } finally {
      setIsUpdatingDueDate(false)
    }
  }, [taskId, toast, reloadTask, task?.due_date])

  const handlePostComment = useCallback(async () => {
    if (!taskId) return
    const content = newComment.trim()
    if (!content) return
    if (isPostingComment) return
    setIsPostingComment(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
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
    } catch (e: any) {
      toast({
        title: "댓글 작성 실패",
        description: e?.message || "댓글을 저장하는 중 오류가 발생했습니다.",
        variant: "destructive",
      })
    } finally {
      setIsPostingComment(false)
    }
  }, [taskId, newComment, loadComments, toast, isPostingComment])

  const handleSaveSubtaskFiles = useCallback(async () => {
    if (!editingSubtaskId) return
    setIsSavingSubtaskFiles(true)
    try {
      const res = await fetch(`/api/tasks/${editingSubtaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          file_keys: editingSubtaskFileKeys,
          comment_file_keys: editingSubtaskCommentFileKeys,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "첨부파일 저장 실패")
      }
      toast({ title: "저장됨", description: "세부업무 첨부파일이 저장되었습니다." })
      setEditingSubtaskId(null)
      setEditingSubtaskFileKeys([])
      setEditingSubtaskCommentFileKeys([])
      await loadSubtasks()
      await reloadTask()
    } catch (e: any) {
      toast({
        title: "저장 실패",
        description: e?.message ?? "첨부파일 저장 중 오류가 발생했습니다.",
        variant: "destructive",
      })
    } finally {
      setIsSavingSubtaskFiles(false)
    }
  }, [editingSubtaskId, editingSubtaskFileKeys, editingSubtaskCommentFileKeys, loadSubtasks, reloadTask, toast])

  /** 그룹 수정 저장: 해당 그룹의 모든 서브태스크에 comment, file_keys, comment_file_keys PATCH */
  const handleSaveGroupEdit = useCallback(
    async (group: { subtitle: string; tasks: Subtask[] }) => {
      setIsSavingGroupEdit(true)
      try {
        for (const st of group.tasks) {
          const data = editingGroupData[st.id]
          if (!data) continue
          const el = document.getElementById(`group-edit-comment-${st.id}`) as HTMLElement | null
          const rawComment = el?.innerHTML ?? data.comment ?? ""
          const comment = sanitizeHtml((rawComment ?? "").trim() ? rawComment : "")
          const res = await fetch(`/api/tasks/${st.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              comment,
              file_keys: data.file_keys,
              comment_file_keys: data.comment_file_keys,
              is_subtask: true,
            }),
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.error || "저장 실패")
          }
        }
        toast({ title: "저장됨", description: "분담내용 및 첨부파일이 저장되었습니다." })
        setEditingGroupSubtitle(null)
        setEditingGroupData({})
        await loadSubtasks()
        await reloadTask()
      } catch (e: any) {
        toast({
          title: "저장 실패",
          description: e?.message ?? "저장 중 오류가 발생했습니다.",
          variant: "destructive",
        })
      } finally {
        setIsSavingGroupEdit(false)
      }
    },
    [editingGroupData, loadSubtasks, reloadTask, toast]
  )

  // 그룹 수정 모드 진입 시 분담내용 contentEditable 초기값 한 번만 설정 (커서 유지)
  useEffect(() => {
    if (!editingGroupSubtitle) {
      didSetGroupEditCommentRef.current = new Set()
      return
    }
    const group = groupedSubtasks.find((g) => g.subtitle === editingGroupSubtitle)
    if (!group) return
    const t = setTimeout(() => {
      group.tasks.forEach((st) => {
        if (didSetGroupEditCommentRef.current.has(st.id)) return
        const el = document.getElementById(`group-edit-comment-${st.id}`) as HTMLElement | null
        if (!el) return
        const data = editingGroupData[st.id]
        const raw = data?.comment ?? ""
        el.innerHTML = raw ? sanitizeHtml(raw) : ""
        didSetGroupEditCommentRef.current.add(st.id)
      })
    }, 0)
    return () => clearTimeout(t)
  }, [editingGroupSubtitle, groupedSubtasks, editingGroupData])

  const handleFinalizeTask = useCallback(async () => {
    if (!taskId || !task) return
    if (!(userRole === "admin" || userRole === "staff")) return
    if (task.status === "completed") return

    setIsFinalizing(true)
    try {
      // 1) 상태를 completed로 변경 (completed_at 자동 설정)
      const updateRes = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "completed" }),
      })

      if (!updateRes.ok) {
        const err = await updateRes.json().catch(() => ({}))
        throw new Error(err.error || "작업 완료 처리 실패")
      }

      // 2) Report 생성 (staff/admin도 가능하도록 서버 권한 확장)
      const reportRes = await fetch(`/api/tasks/${taskId}/create-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      })
      if (!reportRes.ok) {
        const err = await reportRes.json().catch(() => ({}))
        throw new Error(err.error || "Report 생성 실패")
      }

      toast({
        title: "완료 처리됨",
        description: "작업이 완료 처리되었고 Report가 저장되었습니다.",
      })

      await reloadTask()
    } catch (e: any) {
      toast({
        title: "완료 처리 실패",
        description: e?.message || "완료 처리 중 오류가 발생했습니다.",
        variant: "destructive",
      })
    } finally {
      setIsFinalizing(false)
    }
  }, [taskId, task, userRole, toast, reloadTask])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  /** 그룹별 NEW 뱃지 표시 여부 — 등록 후 2일 이내만 true (훅 순서 유지를 위해 early return 이전에 선언) */
  const showNewForGroup = useCallback(
    (subtitle: string) => Date.now() < (newBadgeUntilBySubtitle[subtitle] ?? 0),
    [newBadgeUntilBySubtitle]
  )

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (!task) {
    return null
  }

  // 수정 권한: 요청자(assigned_by) 또는 admin (admin = staff 동일 취급)
  const canEditTask = userRole === "admin" || userRole === "staff" || me?.id === task.assigned_by
  // 공동 업무: 서브태스크에 본인이 있을 때만 수정/첨부 버튼 노출 (파일 추가 등)
  const hasMeInSubtasks = subtasks.length > 0 && subtasks.some((s) => s.assigned_to === me?.id)
  const showRequesterEditAndAttach = subtasks.length === 0 ? canEditTask : (canEditTask && hasMeInSubtasks)
  // 요청자 내용 수정: 요청자(assigned_by)는 main task에 관여하므로 개별/공동 모두 수정 가능. admin/staff도 수정 가능.
  const showRequesterContentEditButton = canEditTask
  // 담당자(admin = staff)만 상태 변경 가능, 요청자(assigned_by)는 상태 선택 블록 미노출
  const canChangeStatus =
    (userRole === "staff" || userRole === "admin") && me?.id !== task.assigned_by

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          뒤로가기
        </Button>
      </div>

      {s3Update && <S3BucketInfoCard s3Update={s3Update} />}

      <Card className="mb-6">
        <CardHeader className="pb-0.5 pt-3">
          <div className="flex items-start justify-between gap-4 mb-1">
            <CardTitle className="text-xl font-bold">{task.title}</CardTitle>
            {canChangeStatus && task.status !== "completed" && (
              <Select
                value={task.status}
                onValueChange={(value) => handleStatusChange(task.id, value as TaskStatusType)}
                disabled={isUpdatingStatus}
              >
                <SelectTrigger
                  className={cn(
                    "h-7 min-w-22 w-auto max-w-26 text-xs shrink-0 border px-2.5 py-1 font-normal",
                    getStatusColor(task.status),
                    getStatusTextColor(task.status)
                  )}
                  aria-label="상태 변경"
                >
                  {isUpdatingStatus ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                      변경 중
                    </span>
                  ) : (
                    <SelectValue placeholder="상태" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending" className="text-gray-500 focus:text-gray-500">
                    대기
                  </SelectItem>
                  <SelectItem value="in_progress" className="text-blue-500 focus:text-blue-500">
                    작업중
                  </SelectItem>
                  <SelectItem value="on_hold" className="text-yellow-500 focus:text-yellow-500">
                    보류
                  </SelectItem>
                  <SelectItem value="awaiting_completion" className="text-purple-500 focus:text-purple-500">
                    완료대기
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          {/* 중요도, 상태, 생성일, 마감일 */}
          <div className="flex items-center gap-3 text-xs mb-1">
            {/* 중요도 */}
            {getPriorityBadge(task.priority)}
            
            {/* 상태 */}
            {getStatusBadge(task.status)}
            {/* 개별/공동 */}
            <Badge variant={task.is_multi_assign ? "secondary" : "outline"} className="font-normal">
              {task.is_multi_assign ? "공동" : "개별"}
            </Badge>
            
            {/* 생성일 */}
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">생성</span>
              <span className="font-medium">{format(new Date(task.created_at), "yy.MM.dd", { locale: ko })}</span>
            </div>
            
            {/* 마감일 */}
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">마감</span>
              <span className="font-medium">{selectedDueDate ? format(selectedDueDate, "yy.MM.dd", { locale: ko }) : "미정"}</span>
              {canEditTask && (
                <Popover open={isDuePopoverOpen} onOpenChange={setIsDuePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 p-0 hover:bg-muted"
                      disabled={isUpdatingDueDate || task.status === "completed"}
                    >
                      <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDueDate || undefined}
                      classNames={{
                        today:
                          "bg-transparent text-foreground rounded-md border border-muted-foreground/30 data-[selected=true]:border-primary data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground",
                      }}
                      onSelect={async (date) => {
                        if (task.status === "completed") return
                        if (!date) {
                          setSelectedDueDate(null)
                          return
                        }

                        if (selectedDueDate && format(selectedDueDate, "yyyy-MM-dd") === format(date, "yyyy-MM-dd")) {
                          setSelectedDueDate(null)
                          return
                        }

                        setSelectedDueDate(date)
                      }}
                      initialFocus
                    />
                    {task.status !== "completed" && (
                      <div className="p-3 border-t">
                        <Button
                          variant="default"
                          size="sm"
                          className="w-full"
                          onClick={async () => {
                            const ok = await applyDueDate(selectedDueDate)
                            if (ok) setIsDuePopoverOpen(false)
                          }}
                          disabled={isUpdatingDueDate}
                        >
                          적용
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="pt-0 pb-3">
          {/* 담당자 정보 */}
          {groupedSubtasks.length === 0 ? (
            <div className="flex items-center gap-6 text-sm mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">요청자</span>
                <span className="font-medium">{task.assigned_by_name || task.assigned_by_email || "Unknown"}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">담당자</span>
                <span className="font-medium">{task.assigned_to_name || task.assigned_to_email || "Unknown"}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-6 text-sm mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">요청자</span>
                <span className="font-medium">{task.assigned_by_name || task.assigned_by_email || "Unknown"}</span>
              </div>
              <div className="flex items-center gap-2 flex-1">
                <span className="text-muted-foreground">담당자</span>
                <div className="flex flex-wrap gap-1.5 items-center">
                  {Array.from(new Set(subtasks.map(st => st.assigned_to))).map((userId, idx) => {
                    const subtask = subtasks.find(st => st.assigned_to === userId)
                    const hasResolvedFile = subtasks.some(st => st.assigned_to === userId && subtaskIdsWithResolvedFiles.has(st.id))
                    return (
                      <span key={userId || idx} className="text-xs font-medium inline-flex items-center gap-1">
                        {subtask?.assigned_to_name || subtask?.assigned_to_email || "담당자"}
                        {hasResolvedFile && (
                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-label="첨부파일 있음" />
                        )}
                        {idx < Array.from(new Set(subtasks.map(st => st.assigned_to))).length - 1 && ", "}
                      </span>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
          
          {/* 첨부파일 정보 (presigned s3_key는 버킷 카드에서만 표시) */}
          {(resolvedFileKeysForDisplay.length > 0 || resolvedCommentFileKeys.length > 0) && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {resolvedFileKeysForDisplay.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  <span>{task.assigned_by_name || "요청자"} 첨부: {resolvedFileKeysForDisplay.length}개</span>
                </div>
              )}
              {resolvedCommentFileKeys.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  <span>{task.assigned_to_name || "담당자"} 등록: {resolvedCommentFileKeys.length}개</span>
                </div>
              )}
            </div>
          )}
          
          {/* 완료일 */}
          {task.completed_at && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1.5">
              <CalendarIcon className="h-3.5 w-3.5" />
              <span>완료일:</span>
              <span className="font-medium text-foreground">{format(new Date(task.completed_at), "yyyy년 MM월 dd일 HH:mm", { locale: ko })}</span>
            </div>
          )}

          {/* 설명 (본문) */}
          {task.description && (
            <div className="mt-4 pt-4 border-t border-border/50">
              <h3 className="text-sm font-semibold text-foreground mb-2">설명</h3>
              <p className="text-sm whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {/* 개별 할당: 요청자 내용을 같은 카드 안에 이어서 표시 (요청자 = main task 관여 → 수정 가능) */}
          {subtasks.length === 0 && (
            <div className="mt-4 pt-4 border-t border-border/50">
              <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                <h3 className="text-lg font-semibold">{task.assigned_by_name || task.assigned_by_email} 내용</h3>
                {showRequesterContentEditButton && !isEditingRequesterContent && (
                    <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingRequesterTitle(task?.title ?? "")
                      setEditingRequesterFileKeys(resolvedFileKeysForDisplay.map((f) => f.s3Key))
                      setIsEditingRequesterContent(true)
                    }}
                  >
                    수정
                  </Button>
                )}
              </div>
              <div className="pt-0 pb-3">
                {showRequesterContentEditButton && isEditingRequesterContent ? (
                  <>
                    <div className="border rounded-md bg-background flex flex-col min-h-[320px]">
                      <div className="flex items-center gap-1 p-2 flex-wrap shrink-0 border-b">
                        <Button
                          type="button"
                          variant={requesterEditorState.bold ? "secondary" : "ghost"}
                          size="sm"
                          className={`h-8 w-8 p-0 ${requesterEditorState.bold ? "bg-primary/10" : ""}`}
                          onClick={(e) => {
                            e.preventDefault()
                            const editor = document.getElementById("requester-content-editor")
                            if (editor) {
                              editor.focus()
                              document.execCommand("bold", false)
                              updateRequesterEditorState()
                            }
                          }}
                          title="굵게 (Ctrl+B)"
                        >
                          <Bold className={`h-4 w-4 ${requesterEditorState.bold ? "text-primary" : ""}`} />
                        </Button>
                        <Button
                          type="button"
                          variant={requesterEditorState.italic ? "secondary" : "ghost"}
                          size="sm"
                          className={`h-8 w-8 p-0 ${requesterEditorState.italic ? "bg-primary/10" : ""}`}
                          onClick={(e) => {
                            e.preventDefault()
                            const editor = document.getElementById("requester-content-editor")
                            if (editor) {
                              editor.focus()
                              document.execCommand("italic", false)
                              updateRequesterEditorState()
                            }
                          }}
                          title="기울임 (Ctrl+I)"
                        >
                          <Italic className={`h-4 w-4 ${requesterEditorState.italic ? "text-primary" : ""}`} />
                        </Button>
                        <Button
                          type="button"
                          variant={requesterEditorState.underline ? "secondary" : "ghost"}
                          size="sm"
                          className={`h-8 w-8 p-0 ${requesterEditorState.underline ? "bg-primary/10" : ""}`}
                          onClick={(e) => {
                            e.preventDefault()
                            const editor = document.getElementById("requester-content-editor")
                            if (editor) {
                              editor.focus()
                              document.execCommand("underline", false)
                              updateRequesterEditorState()
                            }
                          }}
                          title="밑줄"
                        >
                          <Underline className={`h-4 w-4 ${requesterEditorState.underline ? "text-primary" : ""}`} />
                        </Button>
                        <div className="w-px h-6 bg-border mx-1" />
                        <div className="relative">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={(e) => {
                              e.preventDefault()
                              setRequesterTableGridHover(
                                requesterTableGridHover.show
                                  ? { row: 0, col: 0, show: false }
                                  : { row: 0, col: 0, show: true }
                              )
                            }}
                            title="테이블"
                          >
                            <TableIcon className="h-4 w-4" />
                          </Button>
                          {requesterTableGridHover.show && (
                            <div
                              className="absolute top-full left-0 mt-2 bg-background border rounded-lg shadow-xl p-4 z-50 min-w-[280px]"
                              onMouseLeave={() => setRequesterTableGridHover({ row: 0, col: 0, show: false })}
                            >
                              <div className="grid grid-cols-10 gap-1 mb-3">
                                {Array.from({ length: 100 }).map((_, idx) => {
                                  const row = Math.floor(idx / 10) + 1
                                  const col = (idx % 10) + 1
                                  const isSelected =
                                    row <= requesterTableGridHover.row && col <= requesterTableGridHover.col
                                  return (
                                    <div
                                      key={idx}
                                      className={`w-5 h-5 border border-border rounded-sm transition-colors ${
                                        isSelected ? "bg-primary border-primary" : "bg-muted hover:bg-muted/80"
                                      }`}
                                      onMouseEnter={() => setRequesterTableGridHover({ row, col, show: true })}
                                      onClick={() => {
                                        createRequesterTable(row, col)
                                        setRequesterTableGridHover({ row: 0, col: 0, show: false })
                                      }}
                                    />
                                  )
                                })}
                              </div>
                              <div className="text-sm text-center font-medium text-foreground border-t pt-2">
                                {requesterTableGridHover.row > 0 && requesterTableGridHover.col > 0
                                  ? `${requesterTableGridHover.row} x ${requesterTableGridHover.col} 테이블`
                                  : "테이블 크기 선택"}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="w-px h-6 bg-border mx-1" />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={(e) => {
                            e.preventDefault()
                            const editor = document.getElementById("requester-content-editor") as HTMLElement
                            if (editor) {
                              editor.focus()
                              const hr = document.createElement("hr")
                              hr.style.border = "none"
                              hr.style.borderTop = "2px solid #6b7280"
                              hr.style.margin = "10px 0"
                              const selection = window.getSelection()
                              if (selection && selection.rangeCount > 0) {
                                const range = selection.getRangeAt(0)
                                range.deleteContents()
                                range.insertNode(hr)
                                range.setStartAfter(hr)
                                range.collapse(true)
                                selection.removeAllRanges()
                                selection.addRange(range)
                              }
                            }
                          }}
                          title="구분선"
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                      </div>
                      <div
                        id="requester-content-editor"
                        contentEditable
                        suppressContentEditableWarning
                        data-placeholder="내용을 입력하세요."
                        onInput={() => {
                          updateRequesterEditorState()
                          const editor = document.getElementById("requester-content-editor")
                          if (editor) {
                            editor.querySelectorAll("table[data-resizable='true']").forEach((table) => {
                              addResizeHandlersToRequesterTable(table as HTMLTableElement)
                            })
                          }
                        }}
                        onBlur={updateRequesterEditorState}
                        onMouseUp={updateRequesterEditorState}
                        onKeyUp={updateRequesterEditorState}
                        className="text-sm p-3 wrap-break-word word-break break-all overflow-x-auto overflow-y-auto prose prose-sm max-w-none flex-1 min-h-0 custom-scrollbar focus:outline-none focus:ring-0 resize-none w-full min-w-0"
                        style={{
                          minHeight: "200px",
                          whiteSpace: "pre-wrap",
                        }}
                      />
                    </div>
                    <div className="mt-3 flex flex-col gap-2">
                      <input
                        ref={requesterFileInputRef}
                        type="file"
                        className="hidden"
                        multiple
                        accept="*/*"
                        onChange={async (e) => {
                          const files = e.target.files
                          if (!files?.length) return
                          setIsUploadingRequesterFile(true)
                          const addedPaths: string[] = []
                          try {
                            for (let i = 0; i < files.length; i++) {
                              const formData = new FormData()
                              formData.append("file", files[i])
                              formData.append("fileType", "other")
                              formData.append("path", `temp/attachment/${files[i].name}`)
                              const res = await fetch("/api/storage/upload", {
                                method: "POST",
                                credentials: "include",
                                body: formData,
                              })
                              const data = await res.json().catch(() => ({}))
                              if (!res.ok) {
                                throw new Error(data.error || "업로드 실패")
                              }
                              const path = data.path ?? data.s3_key
                              if (path) addedPaths.push(path)
                            }
                            if (addedPaths.length > 0) {
                              setEditingRequesterFileKeys((prev) => [...new Set([...prev, ...addedPaths])])
                            }
                          } catch (err: any) {
                            toast({
                              title: "첨부 업로드 실패",
                              description: err?.message ?? "파일 업로드 중 오류가 발생했습니다.",
                              variant: "destructive",
                            })
                          } finally {
                            setIsUploadingRequesterFile(false)
                            e.target.value = ""
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-fit"
                        disabled={isUploadingRequesterFile}
                        onClick={() => requesterFileInputRef.current?.click()}
                      >
                        {isUploadingRequesterFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                        파일 추가
                      </Button>
                      {editingRequesterFileKeys.map((key, idx) => (
                        <div key={`requester-${idx}-${key}`} className="flex items-center gap-1 rounded border px-2 py-1.5 text-sm">
                          <button
                            type="button"
                            className="text-blue-600 hover:underline truncate max-w-[180px]"
                            onClick={() => handleDownload(key, extractFileName(key, "파일"))}
                          >
                            {extractFileName(key, "파일")}
                          </button>
                          <button
                            type="button"
                            aria-label="첨부 제거"
                            className="p-0.5 text-muted-foreground hover:text-destructive"
                            onClick={() => setEditingRequesterFileKeys((prev) => prev.filter((_, i) => i !== idx))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-3 justify-end">
                      <Button size="sm" onClick={handleSaveRequesterContent} disabled={isSavingRequesterContent}>
                        {isSavingRequesterContent ? <Loader2 className="h-4 w-4 animate-spin" /> : "저장"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingRequesterTitle("")
                          setEditingRequesterFileKeys([])
                          setSelectedDueDate(parseDateOnly(task?.due_date) ?? null)
                          editingSubtitleRef.current = null
                          setIsEditingRequesterContent(false)
                        }}
                        disabled={isSavingRequesterContent}
                      >
                        취소
                      </Button>
                    </div>
                  </>
                ) : task.content ? (
                  <div
                    className="border rounded-md overflow-hidden bg-background"
                    style={{
                      height: "300px",
                      minHeight: "300px",
                      maxHeight: "300px",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <div
                      id="worklist-content-display"
                      className="text-sm bg-muted/50 p-3 wrap-break-word word-break break-all overflow-x-auto overflow-y-auto prose prose-sm max-w-none flex-1 dark:prose-invert custom-scrollbar"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(task.content) }}
                      style={{
                        userSelect: "none",
                        cursor: "default",
                        whiteSpace: "pre-wrap",
                      }}
                    />
                  </div>
                ) : (
                  <div
                    className="border rounded-md bg-muted/30 p-4 text-center text-muted-foreground"
                    style={{
                      height: "300px",
                      minHeight: "300px",
                      maxHeight: "300px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    내용이 없습니다
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 공동 할당: 요청자 내용 (그룹별 탭 선택, 상단에만 표시 — 카드 UI는 분담내용+첨부만 통일) */}
          {subtasks.length > 0 && !showMyAssignment && groupedSubtasks.length > 0 && (() => {
            const effectiveRequesterSubtitle = requesterContentGroupSubtitle ?? groupedSubtasks[0].subtitle
            const selectedRequesterGroup = groupedSubtasks.find((g) => g.subtitle === effectiveRequesterSubtitle) ?? groupedSubtasks[0]
            const selectedGroupContent = selectedRequesterGroup.tasks[0]?.content ?? ""
            return (
              <div className="mt-4 pt-4 border-t border-border/50">
                <div className="flex flex-row items-center justify-between gap-2 pb-2 flex-wrap">
                  <div className="flex items-center gap-1 flex-wrap">
                    {groupedSubtasks.map((g) => (
                      <Button
                        key={g.subtitle}
                        type="button"
                        size="sm"
                        variant={effectiveRequesterSubtitle === g.subtitle ? "secondary" : "ghost"}
                        className="h-8 text-xs"
                        onClick={() => setRequesterContentGroupSubtitle(g.subtitle)}
                      >
                        {g.subtitle}
                      </Button>
                    ))}
                  </div>
                  <p className="text-[11px] font-medium text-muted-foreground shrink-0">요청자 내용</p>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-[11px] font-medium text-muted-foreground">{selectedRequesterGroup.subtitle} · 요청자 내용</p>
                    {showRequesterContentEditButton && !isEditingRequesterContent && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          editingSubtitleRef.current = selectedRequesterGroup.subtitle
                          setSelectedSubtitle(selectedRequesterGroup.subtitle)
                          if (subtasks.length === 0) setEditingRequesterFileKeys(resolvedFileKeysForDisplay.map((f) => f.s3Key))
                          setIsEditingRequesterContent(true)
                        }}
                      >
                        수정
                      </Button>
                    )}
                  </div>
                  {showRequesterContentEditButton && isEditingRequesterContent && selectedSubtitle === selectedRequesterGroup.subtitle ? (
                    <>
                      {subtasks.length === 0 && (
                        <div className="grid gap-2 mb-3">
                          <Label className="text-xs">첨부파일 (요청자)</Label>
                          <div className="flex flex-col gap-2">
                            {editingRequesterFileKeys.map((key, idx) => (
                              <div key={`requester-${idx}-${key}`} className="flex items-center gap-1 rounded border px-2 py-1.5 text-sm">
                                <button type="button" className="text-blue-600 hover:underline truncate max-w-[180px]" onClick={() => handleDownload(key, extractFileName(key, "파일"))}>{extractFileName(key, "파일")}</button>
                                <button type="button" aria-label="첨부 제거" className="p-0.5 text-muted-foreground hover:text-destructive" onClick={() => setEditingRequesterFileKeys((prev) => prev.filter((_, i) => i !== idx))}><Trash2 className="h-3.5 w-3.5" /></button>
                              </div>
                            ))}
                            <Button type="button" variant="outline" size="sm" className="w-fit" disabled={isUploadingRequesterFile} onClick={() => requesterFileInputRef.current?.click()}>
                              {isUploadingRequesterFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                              파일 추가
                            </Button>
                          </div>
                        </div>
                      )}
                      <div className="border rounded-md overflow-hidden bg-background flex flex-col" style={{ height: "400px", minHeight: "400px", maxHeight: "400px" }}>
                        <div className="flex items-center gap-1 p-2 flex-wrap shrink-0 border-b">
                          <Button type="button" variant={requesterEditorState.bold ? "secondary" : "ghost"} size="sm" className={`h-8 w-8 p-0 ${requesterEditorState.bold ? "bg-primary/10" : ""}`} onClick={(e) => { e.preventDefault(); const editor = document.getElementById("requester-content-editor"); if (editor) { editor.focus(); document.execCommand("bold", false); updateRequesterEditorState() } }} title="굵게"><Bold className={`h-4 w-4 ${requesterEditorState.bold ? "text-primary" : ""}`} /></Button>
                          <Button type="button" variant={requesterEditorState.italic ? "secondary" : "ghost"} size="sm" className={`h-8 w-8 p-0 ${requesterEditorState.italic ? "bg-primary/10" : ""}`} onClick={(e) => { e.preventDefault(); const editor = document.getElementById("requester-content-editor"); if (editor) { editor.focus(); document.execCommand("italic", false); updateRequesterEditorState() } }} title="기울임"><Italic className={`h-4 w-4 ${requesterEditorState.italic ? "text-primary" : ""}`} /></Button>
                          <Button type="button" variant={requesterEditorState.underline ? "secondary" : "ghost"} size="sm" className={`h-8 w-8 p-0 ${requesterEditorState.underline ? "bg-primary/10" : ""}`} onClick={(e) => { e.preventDefault(); const editor = document.getElementById("requester-content-editor"); if (editor) { editor.focus(); document.execCommand("underline", false); updateRequesterEditorState() } }} title="밑줄"><Underline className={`h-4 w-4 ${requesterEditorState.underline ? "text-primary" : ""}`} /></Button>
                          <div className="w-px h-6 bg-border mx-1" />
                          <div className="relative">
                            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => { e.preventDefault(); setRequesterTableGridHover(requesterTableGridHover.show ? { row: 0, col: 0, show: false } : { row: 0, col: 0, show: true }) }} title="테이블"><TableIcon className="h-4 w-4" /></Button>
                            {requesterTableGridHover.show && (
                              <div className="absolute top-full left-0 mt-2 bg-background border rounded-lg shadow-xl p-4 z-50 min-w-[280px]" onMouseLeave={() => setRequesterTableGridHover({ row: 0, col: 0, show: false })}>
                                <div className="grid grid-cols-10 gap-1 mb-3">
                                  {Array.from({ length: 100 }).map((_, idx) => {
                                    const row = Math.floor(idx / 10) + 1
                                    const col = (idx % 10) + 1
                                    const isSelected = row <= requesterTableGridHover.row && col <= requesterTableGridHover.col
                                    return (
                                      <div key={idx} className={`w-5 h-5 border border-border rounded-sm transition-colors ${isSelected ? "bg-primary border-primary" : "bg-muted hover:bg-muted/80"}`} onMouseEnter={() => setRequesterTableGridHover({ row, col, show: true })} onClick={() => { createRequesterTable(row, col); setRequesterTableGridHover({ row: 0, col: 0, show: false }) }} />
                                    )
                                  })}
                                </div>
                                <div className="text-sm text-center font-medium text-foreground border-t pt-2">
                                  {requesterTableGridHover.row > 0 && requesterTableGridHover.col > 0 ? `${requesterTableGridHover.row} x ${requesterTableGridHover.col} 테이블` : "테이블 크기 선택"}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="w-px h-6 bg-border mx-1" />
                          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => { e.preventDefault(); const editor = document.getElementById("requester-content-editor") as HTMLElement; if (editor) { editor.focus(); const hr = document.createElement("hr"); hr.style.border = "none"; hr.style.borderTop = "2px solid #6b7280"; hr.style.margin = "10px 0"; const selection = window.getSelection(); if (selection && selection.rangeCount > 0) { const range = selection.getRangeAt(0); range.deleteContents(); range.insertNode(hr); range.setStartAfter(hr); range.collapse(true); selection.removeAllRanges(); selection.addRange(range) } } }} title="구분선"><Minus className="h-4 w-4" /></Button>
                        </div>
                        <div id="requester-content-editor" contentEditable suppressContentEditableWarning data-placeholder="내용을 입력하세요." onInput={() => { updateRequesterEditorState(); const editor = document.getElementById("requester-content-editor"); if (editor) editor.querySelectorAll("table[data-resizable='true']").forEach((table) => addResizeHandlersToRequesterTable(table as HTMLTableElement)) }} onBlur={updateRequesterEditorState} onMouseUp={updateRequesterEditorState} onKeyUp={updateRequesterEditorState} className="text-sm p-3 wrap-break-word word-break break-all overflow-x-auto overflow-y-auto prose prose-sm max-w-none flex-1 custom-scrollbar focus:outline-none focus:ring-0 resize-none w-full min-w-0" style={{ minHeight: "280px", whiteSpace: "pre-wrap" }} />
                      </div>
                      <div className="flex gap-2 mt-3 justify-end">
                        <Button size="sm" onClick={handleSaveRequesterContent} disabled={isSavingRequesterContent}>{isSavingRequesterContent ? <Loader2 className="h-4 w-4 animate-spin" /> : "저장"}</Button>
                        <Button size="sm" variant="outline" onClick={() => { editingSubtitleRef.current = null; setIsEditingRequesterContent(false) }} disabled={isSavingRequesterContent}>취소</Button>
                      </div>
                    </>
                  ) : (
                    <div className="border rounded-md overflow-hidden bg-muted/30 p-4" style={{ minHeight: "300px" }}>
                      {selectedGroupContent ? (
                        <div className="text-base p-3 prose prose-base max-w-none dark:prose-invert" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedGroupContent) }} />
                      ) : (
                        <span className="text-muted-foreground">내용이 없습니다</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
        </CardContent>
      </Card>

      {/* 그룹 수정 모드: 담당자별·요청자 첨부 파일 추가용 hidden input */}
      {editingGroupSubtitle && (
        <input
          ref={groupEditFileInputRef}
          type="file"
          className="hidden"
          multiple
          accept="*/*"
          onChange={async (e) => {
            const fileList = e.target.files
            const target = groupEditFileTargetRef.current
            if (!fileList?.length || !target || target.type !== "requester") {
              e.target.value = ""
              return
            }
            const subtaskId = target.subtaskId
            setIsUploadingGroupEditFile(true)
            const addedPaths: string[] = []
            try {
              for (let i = 0; i < fileList.length; i++) {
                const formData = new FormData()
                formData.append("file", fileList[i])
                formData.append("fileType", "other")
                formData.append("path", `temp/attachment/${fileList[i].name}`)
                const res = await fetch("/api/storage/upload", {
                  method: "POST",
                  credentials: "include",
                  body: formData,
                })
                const data = await res.json().catch(() => ({}))
                if (!res.ok) throw new Error((data as { error?: string }).error || "업로드 실패")
                const path = (data as { path?: string; s3_key?: string }).path ?? (data as { path?: string; s3_key?: string }).s3_key
                if (path) addedPaths.push(path)
              }
              if (addedPaths.length > 0) {
                setEditingGroupData((prev) => ({
                  ...prev,
                  [subtaskId]: {
                    ...(prev[subtaskId] ?? { comment: "", file_keys: [], comment_file_keys: [] }),
                    file_keys: [...new Set([...(prev[subtaskId]?.file_keys ?? []), ...addedPaths])],
                  },
                }))
              }
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : "파일 업로드 중 오류가 발생했습니다."
              toast({ title: "첨부 업로드 실패", description: message, variant: "destructive" })
            } finally {
              setIsUploadingGroupEditFile(false)
              e.target.value = ""
            }
          }}
        />
      )}

      {/* 공동 업무: 첨부하기 클릭 시 파일 선택 → 해당 서브그룹의 모든 서브태스크 요청자 첨부(file_keys)에 추가 */}
      {subtasks.length > 0 && canEditTask && (
        <input
          ref={sharedAttachInputRef}
          type="file"
          className="hidden"
          multiple
          accept="*/*"
          onChange={async (e) => {
            const fileList = e.target.files
            e.target.value = ""
            if (!fileList?.length) return
            const group = sharedAttachGroupRef.current
            if (!group?.tasks?.length) return
            if (!window.confirm(`선택한 ${fileList.length}개 파일을 "${group.subtitle}" 그룹에 첨부할까요?`)) return
            setIsUploadingSharedAttach(true)
            const addedPaths: string[] = []
            try {
              for (let i = 0; i < fileList.length; i++) {
                const formData = new FormData()
                formData.append("file", fileList[i])
                formData.append("fileType", "other")
                formData.append("path", `temp/attachment/${fileList[i].name}`)
                const res = await fetch("/api/storage/upload", {
                  method: "POST",
                  credentials: "include",
                  body: formData,
                })
                const data = await res.json().catch(() => ({}))
                if (!res.ok) throw new Error(data.error || "업로드 실패")
                const path = data.path ?? data.s3_key
                if (path) addedPaths.push(path)
              }
              if (addedPaths.length > 0) {
                for (const subtask of group.tasks) {
                  const currentKeys = normalizeFileKeyArray(subtask.file_keys ?? [])
                  const newFileKeys = [...new Set([...currentKeys, ...addedPaths])]
                  const patchRes = await fetch(`/api/tasks/${subtask.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ file_keys: newFileKeys }),
                  })
                  if (!patchRes.ok) {
                    const err = await patchRes.json().catch(() => ({}))
                    throw new Error(err.error || "첨부파일 저장 실패")
                  }
                }
                setNewAttachedKeysPerGroup((prev) => ({
                  ...prev,
                  [group.subtitle]: [...(prev[group.subtitle] || []), ...addedPaths],
                }))
                const until = Date.now() + NEW_BADGE_MS
                setNewBadgeUntilBySubtitle((prev) => ({ ...prev, [group.subtitle]: until }))
                try {
                  const key = `task_new_badge_${taskId}`
                  const raw = localStorage.getItem(key)
                  const prev = raw ? (JSON.parse(raw) as Record<string, number>) : {}
                  localStorage.setItem(key, JSON.stringify({ ...prev, [group.subtitle]: until }))
                } catch {
                  // ignore
                }
                toast({ title: "저장됨", description: "해당 서브그룹 요청자 첨부파일이 저장되었습니다." })
                await loadSubtasks()
                await reloadTask()
              }
            } catch (err: any) {
              toast({
                title: "첨부 실패",
                description: err?.message ?? "파일 업로드 또는 저장 중 오류가 발생했습니다.",
                variant: "destructive",
              })
            } finally {
              setIsUploadingSharedAttach(false)
            }
          }}
        />
      )}

      {/* 세부업무 첨부파일 업로드용 hidden input */}
      {editingSubtaskId && (
        <input
          ref={subtaskFileInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={async (e) => {
            const files = e.target.files
            if (!files?.length) return
            const target = subtaskFileUploadTargetRef.current
            if (!target) return
            setIsUploadingSubtaskFile(true)
            const addedPaths: string[] = []
            try {
              for (let i = 0; i < files.length; i++) {
                const formData = new FormData()
                formData.append("file", files[i])
                formData.append("fileType", "other")
                formData.append("path", `temp/attachment/${files[i].name}`)
                const res = await fetch("/api/storage/upload", {
                  method: "POST",
                  credentials: "include",
                  body: formData,
                })
                const data = await res.json().catch(() => ({}))
                if (!res.ok) {
                  throw new Error(data.error || "업로드 실패")
                }
                const path = data.path ?? data.s3_key
                if (path) addedPaths.push(path)
              }
              if (addedPaths.length > 0 && target === "requester") {
                setEditingSubtaskFileKeys((prev) => [...new Set([...prev, ...addedPaths])])
              }
            } catch (err: any) {
              toast({
                title: "첨부 업로드 실패",
                description: err?.message ?? "파일 업로드 중 오류가 발생했습니다.",
                variant: "destructive",
              })
            } finally {
              setIsUploadingSubtaskFile(false)
              e.target.value = ""
            }
          }}
        />
      )}

      {/* 요청자 첨부파일 업로드용 hidden input (공동 수정 시만 — 개별은 위 그리드 안 input 사용) */}
      {isEditingRequesterContent && subtasks.length > 0 && (
        <input
          ref={requesterFileInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={async (e) => {
            const files = e.target.files
            if (!files?.length) return
            setIsUploadingRequesterFile(true)
            const addedPaths: string[] = []
            try {
              for (let i = 0; i < files.length; i++) {
                const formData = new FormData()
                formData.append("file", files[i])
                formData.append("fileType", "other")
                formData.append("path", `temp/attachment/${files[i].name}`)
                const res = await fetch("/api/storage/upload", {
                  method: "POST",
                  credentials: "include",
                  body: formData,
                })
                const data = await res.json().catch(() => ({}))
                if (!res.ok) {
                  throw new Error(data.error || "업로드 실패")
                }
                const path = data.path ?? data.s3_key
                if (path) addedPaths.push(path)
              }
              if (addedPaths.length > 0) {
                setEditingRequesterFileKeys((prev) => [...new Set([...prev, ...addedPaths])])
              }
            } catch (err: any) {
              toast({
                title: "첨부 업로드 실패",
                description: err?.message ?? "파일 업로드 중 오류가 발생했습니다.",
                variant: "destructive",
              })
            } finally {
              setIsUploadingRequesterFile(false)
              e.target.value = ""
            }
          }}
        />
      )}

      {/* 개별 할당: subtasks가 없을 때 — 담당자 내용 카드만 (요청자 내용은 상단 카드에 통합됨) */}
      {subtasks.length === 0 && (
        <div className="space-y-6 mb-6">
          {/* 담당자 내용 - 항상 표시 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{task.assigned_to_name || task.assigned_to_email} 내용</CardTitle>
            </CardHeader>
            <CardContent>
              {task.comment && task.comment.trim() ? (
                <div
                  className="border rounded-md overflow-hidden bg-background"
                  style={{
                    height: "300px",
                    minHeight: "300px",
                    maxHeight: "300px",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div
                    className="text-sm bg-muted/50 p-3 wrap-break-word word-break break-all overflow-x-auto overflow-y-auto prose prose-sm max-w-none flex-1 dark:prose-invert custom-scrollbar"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(task.comment.startsWith('\n') ? task.comment.substring(1) : task.comment) }}
                    style={{
                      userSelect: "none",
                      cursor: "default",
                      whiteSpace: "pre-wrap",
                    }}
                  />
                </div>
              ) : (
                <div
                  className="border rounded-md bg-muted/30 p-4 text-center text-muted-foreground"
                  style={{
                    height: "300px",
                    minHeight: "300px",
                    maxHeight: "300px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  내용이 없습니다
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 공동 할당: subtasks가 있을 때 */}
      {subtasks.length > 0 && (
        <div className="space-y-6 mb-6">
          {showMyAssignment ? (
            /* 내 담당업무 보기: 기존 단일 카드 + 분담내용 카드 */
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-lg">내 담당업무</CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                  const commentRaw = mySubtaskForComment?.comment ?? ""
                  const commentDisplay = commentRaw.startsWith("\n") ? commentRaw.substring(1) : commentRaw
                  if (isEditingMyComment && mySubtaskForComment) {
                    return (
                      <>
                        <div
                          className="border rounded-md overflow-hidden bg-background flex flex-col"
                          style={{
                            height: "300px",
                            minHeight: "300px",
                            maxHeight: "300px",
                          }}
                        >
                          <div
                            id="my-comment-editor"
                            contentEditable
                            suppressContentEditableWarning
                            data-placeholder="내가 작성한 분담내용을 입력하세요."
                            className="text-sm p-3 wrap-break-word word-break break-all overflow-x-auto overflow-y-auto prose prose-sm max-w-none flex-1 custom-scrollbar focus:outline-none focus:ring-0 resize-none w-full min-w-0"
                            style={{ minHeight: "280px", whiteSpace: "pre-wrap" }}
                          />
                        </div>
                        <div className="flex gap-2 mt-3">
                          <Button size="sm" onClick={handleSaveMyComment} disabled={isSavingMyComment}>
                            {isSavingMyComment ? <Loader2 className="h-4 w-4 animate-spin" /> : "저장"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setIsEditingMyComment(false)}
                            disabled={isSavingMyComment}
                          >
                            취소
                          </Button>
                        </div>
                      </>
                    )
                  }
                  return commentDisplay ? (
                    <div
                      className="border rounded-md overflow-hidden bg-background"
                      style={{
                        height: "420px",
                        minHeight: "420px",
                        maxHeight: "420px",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <div
                        className="text-base bg-muted/50 p-4 wrap-break-word word-break break-all overflow-x-auto overflow-y-auto prose prose-base max-w-none flex-1 dark:prose-invert custom-scrollbar"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(commentDisplay) }}
                        style={{ userSelect: "none", cursor: "default", whiteSpace: "pre-wrap" }}
                      />
                    </div>
                  ) : (
                    <div
                      className="border rounded-md bg-muted/30 p-4 text-center text-muted-foreground"
                      style={{
                        height: "300px",
                        minHeight: "300px",
                        maxHeight: "300px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      내가 작성한 분담내용이 없습니다. 수정 버튼으로 작성해 보세요.
                    </div>
                  )
                  })()}
                </CardContent>
          </Card>

          {/* 분담내용 (내 담당업무 보기 시 단일 카드) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                분담내용 {selectedSubtask && <span className="text-sm text-muted-foreground ml-2">- {selectedSubtask.assigned_to_name || selectedSubtask.assigned_to_email}</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-md overflow-hidden" style={{ height: "560px", display: "flex", gap: "8px" }}>
                <div className="flex-1 overflow-hidden flex flex-col min-w-0">
                  {selectedSubtask ? (
                    <div className="h-full overflow-y-auto custom-scrollbar">
                      {selectedSubtask.comment && selectedSubtask.comment.trim() ? (
                        <div
                          id="worklist-subtask-content"
                          className="text-base bg-muted/50 p-4 prose prose-base max-w-none dark:prose-invert h-full"
                          dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedSubtask.comment.startsWith('\n') ? selectedSubtask.comment.substring(1) : selectedSubtask.comment) }}
                          style={{
                            userSelect: "none",
                            cursor: "default",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            overflowWrap: "break-word",
                          }}
                        />
                      ) : (
                        <div className="bg-muted/30 p-4 text-center text-muted-foreground h-full flex items-center justify-center">
                          담당자가 작성한 내용이 없습니다
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-muted/30 p-4 text-center text-muted-foreground h-full flex items-center justify-center">
                      서브태스크를 선택하세요
                    </div>
                  )}
                </div>
                <div className="w-[240px] bg-muted/30 overflow-y-auto custom-scrollbar p-3 space-y-3">
                  {isLoadingSubtasks ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    groupedSubtasks.map((group) => (
                      <div key={group.subtitle} className="border-2 border-muted rounded-lg p-2 bg-background/50 space-y-1.5">
                        <div className="flex items-center justify-between gap-1 mb-1 px-1 min-h-[20px]">
                          <div className="text-[11px] font-semibold text-foreground/80 truncate min-w-0">{group.subtitle}</div>
                          {canEditTask && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-1.5 text-[10px] shrink-0 flex items-center gap-0.5"
                              disabled={isUploadingSharedAttach}
                              onClick={() => {
                                sharedAttachGroupRef.current = { subtitle: group.subtitle, tasks: group.tasks }
                                sharedAttachInputRef.current?.click()
                              }}
                            >
                              {isUploadingSharedAttach ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
                              파일 추가
                            </Button>
                          )}
                        </div>
                        {group.tasks.map((subtask) => (
                          <StaffSessionBlock
                            key={subtask.id}
                            subtask={subtask}
                            isSelected={selectedSubtask?.id === subtask.id}
                            isCompleting={isCompletingSubtask}
                            onSelect={() => setSelectedSubtask(selectedSubtask?.id === subtask.id ? null : subtask)}
                            onComplete={completeSubtask}
                            canCompleteSubtask={canEditTask}
                            canRevertAwaitingToPending={canEditTask}
                            onRevertAwaitingToPending={handleRevertSubtaskToPending}
                            isReverting={revertingSubtaskId === subtask.id}
                            hasAttachment={subtaskIdsWithResolvedFiles.has(subtask.id)}
                            isMyBlock={subtask.assigned_to === me?.id}
                          />
                        ))}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        /* 요청자 내용 보기: 그룹별 요청자 내용 + 분담내용 카드 (첫 그룹 요청자 내용은 상단 카드에 통합됨) */
        <>
          {groupedSubtasks.map((group) => {
            const selectedSubtaskInGroup = group.tasks.find((t) => t.id === selectedSubtaskIdBySubtitle[group.subtitle]) ?? null
            const groupRequesterContent = group.tasks[0]?.content ?? ""
            return (
              <Card key={group.subtitle}>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-lg">{group.subtitle}</CardTitle>
                  <div className="flex items-center gap-2 shrink-0">
                    {canEditTask && editingGroupSubtitle !== group.subtitle && !selectedSubtaskInGroup && (
                      <span className="text-xs text-muted-foreground">담당자를 선택한 뒤 수정할 수 있습니다</span>
                    )}
                    {canEditTask && selectedSubtaskInGroup && editingGroupSubtitle !== group.subtitle && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => {
                          const t = selectedSubtaskInGroup
                          const initial: Record<string, { comment: string; file_keys: string[]; comment_file_keys: string[] }> = {
                            [t.id]: {
                              comment: t.comment ?? "",
                              file_keys: normalizeFileKeyArray(t.file_keys ?? []),
                              comment_file_keys: normalizeFileKeyArray(t.comment_file_keys ?? []),
                            },
                          }
                          setEditingGroupData(initial)
                          setEditingGroupSubtitle(group.subtitle)
                        }}
                      >
                        수정
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {false && (
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-[11px] font-medium text-muted-foreground">요청자 내용</p>
                      {showRequesterContentEditButton && !isEditingRequesterContent && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            editingSubtitleRef.current = group.subtitle
                            setSelectedSubtitle(group.subtitle)
                            if (subtasks.length === 0) setEditingRequesterFileKeys(resolvedFileKeysForDisplay.map((f) => f.s3Key))
                            setIsEditingRequesterContent(true)
                          }}
                        >
                          수정
                        </Button>
                      )}
                    </div>
                    {showRequesterContentEditButton && isEditingRequesterContent && selectedSubtitle === group.subtitle ? (
                      <>
                        {subtasks.length === 0 && (
                          <div className="grid gap-2 mb-3">
                            <Label className="text-xs">첨부파일 (요청자)</Label>
                            <div className="flex flex-col gap-2">
                              {editingRequesterFileKeys.map((key, idx) => (
                                <div key={`requester-${idx}-${key}`} className="flex items-center gap-1 rounded border px-2 py-1.5 text-sm">
                                  <button
                                    type="button"
                                    className="text-blue-600 hover:underline truncate max-w-[180px]"
                                    onClick={() => handleDownload(key, extractFileName(key, "파일"))}
                                  >
                                    {extractFileName(key, "파일")}
                                  </button>
                                  <button
                                    type="button"
                                    aria-label="첨부 제거"
                                    className="p-0.5 text-muted-foreground hover:text-destructive"
                                    onClick={() => setEditingRequesterFileKeys((prev) => prev.filter((_, i) => i !== idx))}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ))}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-fit"
                                disabled={isUploadingRequesterFile}
                                onClick={() => requesterFileInputRef.current?.click()}
                              >
                                {isUploadingRequesterFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                                파일 추가
                              </Button>
                            </div>
                          </div>
                        )}
                        <div
                          className="border rounded-md overflow-hidden bg-background flex flex-col"
                          style={{
                            height: "520px",
                            minHeight: "520px",
                            maxHeight: "520px",
                          }}
                        >
                          <div className="flex items-center gap-1 p-2 flex-wrap shrink-0 border-b">
                            <Button
                              type="button"
                              variant={requesterEditorState.bold ? "secondary" : "ghost"}
                              size="sm"
                              className={`h-8 w-8 p-0 ${requesterEditorState.bold ? "bg-primary/10" : ""}`}
                              onClick={(e) => {
                                e.preventDefault()
                                const editor = document.getElementById("requester-content-editor")
                                if (editor) {
                                  editor.focus()
                                  document.execCommand("bold", false)
                                  updateRequesterEditorState()
                                }
                              }}
                              title="굵게 (Ctrl+B)"
                            >
                              <Bold className={`h-4 w-4 ${requesterEditorState.bold ? "text-primary" : ""}`} />
                            </Button>
                            <Button
                              type="button"
                              variant={requesterEditorState.italic ? "secondary" : "ghost"}
                              size="sm"
                              className={`h-8 w-8 p-0 ${requesterEditorState.italic ? "bg-primary/10" : ""}`}
                              onClick={(e) => {
                                e.preventDefault()
                                const editor = document.getElementById("requester-content-editor")
                                if (editor) {
                                  editor.focus()
                                  document.execCommand("italic", false)
                                  updateRequesterEditorState()
                                }
                              }}
                              title="기울임 (Ctrl+I)"
                            >
                              <Italic className={`h-4 w-4 ${requesterEditorState.italic ? "text-primary" : ""}`} />
                            </Button>
                            <Button
                              type="button"
                              variant={requesterEditorState.underline ? "secondary" : "ghost"}
                              size="sm"
                              className={`h-8 w-8 p-0 ${requesterEditorState.underline ? "bg-primary/10" : ""}`}
                              onClick={(e) => {
                                e.preventDefault()
                                const editor = document.getElementById("requester-content-editor")
                                if (editor) {
                                  editor.focus()
                                  document.execCommand("underline", false)
                                  updateRequesterEditorState()
                                }
                              }}
                              title="밑줄"
                            >
                              <Underline className={`h-4 w-4 ${requesterEditorState.underline ? "text-primary" : ""}`} />
                            </Button>
                            <div className="w-px h-6 bg-border mx-1" />
                            <div className="relative">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={(e) => {
                                  e.preventDefault()
                                  setRequesterTableGridHover(
                                    requesterTableGridHover.show
                                      ? { row: 0, col: 0, show: false }
                                      : { row: 0, col: 0, show: true }
                                  )
                                }}
                                title="테이블"
                              >
                                <TableIcon className="h-4 w-4" />
                              </Button>
                              {requesterTableGridHover.show && (
                                <div
                                  className="absolute top-full left-0 mt-2 bg-background border rounded-lg shadow-xl p-4 z-50 min-w-[280px]"
                                  onMouseLeave={() => setRequesterTableGridHover({ row: 0, col: 0, show: false })}
                                >
                                  <div className="grid grid-cols-10 gap-1 mb-3">
                                    {Array.from({ length: 100 }).map((_, idx) => {
                                      const row = Math.floor(idx / 10) + 1
                                      const col = (idx % 10) + 1
                                      const isSelected =
                                        row <= requesterTableGridHover.row && col <= requesterTableGridHover.col
                                      return (
                                        <div
                                          key={idx}
                                          className={`w-5 h-5 border border-border rounded-sm transition-colors ${
                                            isSelected ? "bg-primary border-primary" : "bg-muted hover:bg-muted/80"
                                          }`}
                                          onMouseEnter={() => setRequesterTableGridHover({ row, col, show: true })}
                                          onClick={() => {
                                            createRequesterTable(row, col)
                                            setRequesterTableGridHover({ row: 0, col: 0, show: false })
                                          }}
                                        />
                                      )
                                    })}
                                  </div>
                                  <div className="text-sm text-center font-medium text-foreground border-t pt-2">
                                    {requesterTableGridHover.row > 0 && requesterTableGridHover.col > 0
                                      ? `${requesterTableGridHover.row} x ${requesterTableGridHover.col} 테이블`
                                      : "테이블 크기 선택"}
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="w-px h-6 bg-border mx-1" />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={(e) => {
                                e.preventDefault()
                                const editor = document.getElementById("requester-content-editor") as HTMLElement
                                if (editor) {
                                  editor.focus()
                                  const hr = document.createElement("hr")
                                  hr.style.border = "none"
                                  hr.style.borderTop = "2px solid #6b7280"
                                  hr.style.margin = "10px 0"
                                  const selection = window.getSelection()
                                  if (selection && selection.rangeCount > 0) {
                                    const range = selection.getRangeAt(0)
                                    range.deleteContents()
                                    range.insertNode(hr)
                                    range.setStartAfter(hr)
                                    range.collapse(true)
                                    selection.removeAllRanges()
                                    selection.addRange(range)
                                  }
                                }
                              }}
                              title="구분선"
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                          </div>
                          <div
                            id="requester-content-editor"
                            contentEditable
                            suppressContentEditableWarning
                            data-placeholder="내용을 입력하세요."
                            onInput={() => {
                              updateRequesterEditorState()
                              const editor = document.getElementById("requester-content-editor")
                              if (editor) {
                                editor.querySelectorAll("table[data-resizable='true']").forEach((table) => {
                                  addResizeHandlersToRequesterTable(table as HTMLTableElement)
                                })
                              }
                            }}
                            onBlur={updateRequesterEditorState}
                            onMouseUp={updateRequesterEditorState}
                            onKeyUp={updateRequesterEditorState}
                            className="text-sm p-3 wrap-break-word word-break break-all overflow-x-auto overflow-y-auto prose prose-sm max-w-none flex-1 custom-scrollbar focus:outline-none focus:ring-0 resize-none w-full min-w-0"
                            style={{
                              minHeight: "280px",
                              whiteSpace: "pre-wrap",
                            }}
                          />
                        </div>
                        <div className="flex gap-2 mt-3 justify-end">
                          <Button size="sm" onClick={handleSaveRequesterContent} disabled={isSavingRequesterContent}>
                            {isSavingRequesterContent ? <Loader2 className="h-4 w-4 animate-spin" /> : "저장"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              editingSubtitleRef.current = null
                              setIsEditingRequesterContent(false)
                            }}
                            disabled={isSavingRequesterContent}
                          >
                            취소
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="border rounded-md bg-muted/30 p-4 overflow-y-auto" style={{ height: "520px", minHeight: "520px" }}>
                        {groupRequesterContent ? (
                          <div
                            className="text-base p-3 prose prose-base max-w-none dark:prose-invert"
                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(groupRequesterContent) }}
                            style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                          />
                        ) : (
                          <span className="text-muted-foreground">내용이 없습니다</span>
                        )}
                      </div>
                    )}
                  </div>
                  )}
                  {editingGroupSubtitle === group.subtitle ? (
                    <>
                      <div>
                        <p className="text-[11px] font-medium text-muted-foreground mb-1">분담내용</p>
                        <div className="border rounded-md overflow-hidden" style={{ height: "520px", display: "flex", gap: "8px" }}>
                          <div className="flex-1 overflow-hidden flex flex-col min-w-0 bg-background">
                            {(() => {
                              const editSubtask = group.tasks.find((t) => t.id in editingGroupData)
                              if (!editSubtask) return null
                              const editorId = `group-edit-comment-${editSubtask.id}`
                              return (
                                <>
                                  <div className="flex items-center gap-1 p-2 flex-wrap shrink-0 border-b bg-muted/30">
                                    <Button
                                      type="button"
                                      variant={groupEditEditorState.bold ? "secondary" : "ghost"}
                                      size="sm"
                                      className={`h-8 w-8 p-0 ${groupEditEditorState.bold ? "bg-primary/10" : ""}`}
                                      onClick={(e) => {
                                        e.preventDefault()
                                        const editor = document.getElementById(editorId)
                                        if (editor) {
                                          editor.focus()
                                          document.execCommand("bold", false)
                                          updateGroupEditEditorState()
                                        }
                                      }}
                                      title="굵게 (Ctrl+B)"
                                    >
                                      <Bold className={`h-4 w-4 ${groupEditEditorState.bold ? "text-primary" : ""}`} />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant={groupEditEditorState.italic ? "secondary" : "ghost"}
                                      size="sm"
                                      className={`h-8 w-8 p-0 ${groupEditEditorState.italic ? "bg-primary/10" : ""}`}
                                      onClick={(e) => {
                                        e.preventDefault()
                                        const editor = document.getElementById(editorId)
                                        if (editor) {
                                          editor.focus()
                                          document.execCommand("italic", false)
                                          updateGroupEditEditorState()
                                        }
                                      }}
                                      title="기울임 (Ctrl+I)"
                                    >
                                      <Italic className={`h-4 w-4 ${groupEditEditorState.italic ? "text-primary" : ""}`} />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant={groupEditEditorState.underline ? "secondary" : "ghost"}
                                      size="sm"
                                      className={`h-8 w-8 p-0 ${groupEditEditorState.underline ? "bg-primary/10" : ""}`}
                                      onClick={(e) => {
                                        e.preventDefault()
                                        const editor = document.getElementById(editorId)
                                        if (editor) {
                                          editor.focus()
                                          document.execCommand("underline", false)
                                          updateGroupEditEditorState()
                                        }
                                      }}
                                      title="밑줄"
                                    >
                                      <Underline className={`h-4 w-4 ${groupEditEditorState.underline ? "text-primary" : ""}`} />
                                    </Button>
                                    <div className="w-px h-6 bg-border mx-1" />
                                    <div className="relative">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                        onClick={(e) => {
                                          e.preventDefault()
                                          setGroupEditTableGridHover(
                                            groupEditTableGridHover.show
                                              ? { row: 0, col: 0, show: false }
                                              : { row: 0, col: 0, show: true }
                                          )
                                        }}
                                        title="테이블"
                                      >
                                        <TableIcon className="h-4 w-4" />
                                      </Button>
                                      {groupEditTableGridHover.show && (
                                        <div
                                          className="absolute top-full left-0 mt-2 bg-background border rounded-lg shadow-xl p-4 z-50 min-w-[280px]"
                                          onMouseLeave={() => setGroupEditTableGridHover({ row: 0, col: 0, show: false })}
                                        >
                                          <div className="grid grid-cols-10 gap-1 mb-3">
                                            {Array.from({ length: 100 }).map((_, idx) => {
                                              const row = Math.floor(idx / 10) + 1
                                              const col = (idx % 10) + 1
                                              const isSelected =
                                                row <= groupEditTableGridHover.row && col <= groupEditTableGridHover.col
                                              return (
                                                <div
                                                  key={idx}
                                                  className={`w-5 h-5 border border-border rounded-sm transition-colors ${
                                                    isSelected ? "bg-primary border-primary" : "bg-muted hover:bg-muted/80"
                                                  }`}
                                                  onMouseEnter={() => setGroupEditTableGridHover({ row, col, show: true })}
                                                  onClick={() => {
                                                    createGroupEditTable(row, col)
                                                    setGroupEditTableGridHover({ row: 0, col: 0, show: false })
                                                  }}
                                                />
                                              )
                                            })}
                                          </div>
                                          <div className="text-sm text-center font-medium text-foreground border-t pt-2">
                                            {groupEditTableGridHover.row > 0 && groupEditTableGridHover.col > 0
                                              ? `${groupEditTableGridHover.row} x ${groupEditTableGridHover.col} 테이블`
                                              : "테이블 크기 선택"}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                    <div className="w-px h-6 bg-border mx-1" />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0"
                                      onClick={(e) => {
                                        e.preventDefault()
                                        const editor = document.getElementById(editorId) as HTMLElement
                                        if (editor) {
                                          editor.focus()
                                          const hr = document.createElement("hr")
                                          hr.style.border = "none"
                                          hr.style.borderTop = "2px solid #6b7280"
                                          hr.style.margin = "10px 0"
                                          const selection = window.getSelection()
                                          if (selection && selection.rangeCount > 0) {
                                            const range = selection.getRangeAt(0)
                                            range.deleteContents()
                                            range.insertNode(hr)
                                            range.setStartAfter(hr)
                                            range.collapse(true)
                                            selection.removeAllRanges()
                                            selection.addRange(range)
                                          }
                                        }
                                      }}
                                      title="구분선"
                                    >
                                      <Minus className="h-4 w-4" />
                                    </Button>
                                  </div>
                                  <div
                                    id={editorId}
                                    contentEditable
                                    suppressContentEditableWarning
                                    className="text-base p-4 prose prose-base max-w-none dark:prose-invert flex-1 overflow-y-auto custom-scrollbar focus:outline-none focus:ring-0 rounded min-h-0"
                                    style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "break-word" }}
                                    onInput={() => {
                                      const el = document.getElementById(editorId) as HTMLElement | null
                                      if (!el) return
                                      const raw = el.innerHTML ?? ""
                                      setEditingGroupData((prev) => ({ ...prev, [editSubtask.id]: { ...(prev[editSubtask.id] ?? { comment: "", file_keys: [], comment_file_keys: [] }), comment: raw } }))
                                      el.querySelectorAll("table[data-resizable='true']").forEach((table) => {
                                        addResizeHandlersToGroupEditTable(table as HTMLTableElement)
                                      })
                                    }}
                                    onBlur={updateGroupEditEditorState}
                                    onMouseUp={updateGroupEditEditorState}
                                    onKeyUp={updateGroupEditEditorState}
                                  />
                                </>
                              )
                            })()}
                          </div>
                          <div className="w-[240px] bg-muted/30 overflow-y-auto custom-scrollbar p-3 space-y-3">
                            {isLoadingSubtasks ? (
                              <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                              </div>
                            ) : (
                              group.tasks.map((subtask) => (
                                <StaffSessionBlock
                                  key={subtask.id}
                                  subtask={subtask}
                                  isSelected={group.tasks.some((t) => t.id in editingGroupData && t.id === subtask.id)}
                                  isCompleting={isCompletingSubtask}
                                  onSelect={() => {}}
                                  onComplete={completeSubtask}
                                  canCompleteSubtask={canEditTask}
                                  canRevertAwaitingToPending={canEditTask}
                                  onRevertAwaitingToPending={handleRevertSubtaskToPending}
                                  isReverting={revertingSubtaskId === subtask.id}
                                  hasAttachment={subtaskIdsWithResolvedFiles.has(subtask.id)}
                                  isMyBlock={subtask.assigned_to === me?.id}
                                />
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                      {(() => {
                        const editSubtask = group.tasks.find((t) => t.id in editingGroupData)
                        if (!editSubtask) return null
                        const data = editingGroupData[editSubtask.id] ?? { comment: "", file_keys: [], comment_file_keys: [] }
                        const requesterKeys = data.file_keys ?? []
                        return (
                          <div className="space-y-2 pt-4 border-t">
                            <p className="text-xs font-medium text-muted-foreground">첨부파일 (요청자)</p>
                            <div className="flex flex-col gap-1.5 pl-0">
                              <Button size="sm" variant="outline" className="w-fit" disabled={isUploadingGroupEditFile} onClick={() => { groupEditFileTargetRef.current = { type: "requester", subtaskId: editSubtask.id }; groupEditFileInputRef.current?.click() }}>
                                {isUploadingGroupEditFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                                파일 추가
                              </Button>
                              {requesterKeys.map((key, idx) => (
                                <div key={`${editSubtask.id}-requester-${idx}-${key}`} className="flex items-center gap-1.5 rounded border px-2 py-1.5 text-sm w-fit">
                                  <span className="text-foreground truncate max-w-[280px]" title={extractFileName(key, "파일")}>{extractFileName(key, "파일")}</span>
                                  <button type="button" className="text-blue-600 hover:underline shrink-0 text-xs" onClick={() => handleDownload(key, extractFileName(key, "파일"))}>다운로드</button>
                                  <button type="button" aria-label="제거" className="p-0.5 text-muted-foreground hover:text-destructive shrink-0" onClick={() => setEditingGroupData((prev) => ({ ...prev, [editSubtask.id]: { ...(prev[editSubtask.id] ?? { comment: "", file_keys: [], comment_file_keys: [] }), file_keys: (prev[editSubtask.id]?.file_keys ?? []).filter((_, i) => i !== idx) } }))}><Trash2 className="h-3.5 w-3.5" /></button>
                                </div>
                              ))}
                            </div>
                            <div className="flex gap-2 justify-end pt-2">
                              <Button size="sm" onClick={() => handleSaveGroupEdit(group)} disabled={isSavingGroupEdit}>
                                {isSavingGroupEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : "저장"}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => { setEditingGroupSubtitle(null); setEditingGroupData({}) }} disabled={isSavingGroupEdit}>취소</Button>
                            </div>
                          </div>
                        )
                      })()}
                    </>
                  ) : (
                    <>
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground mb-1">분담내용</p>
                    <div className="border rounded-md overflow-hidden" style={{ height: "520px", display: "flex", gap: "8px" }}>
                      <div className="flex-1 overflow-hidden flex flex-col min-w-0">
                        {selectedSubtaskInGroup ? (
                          <div className="h-full overflow-y-auto custom-scrollbar">
                            {selectedSubtaskInGroup.comment && selectedSubtaskInGroup.comment.trim() ? (
                              <div
                                className="text-base bg-muted/50 p-4 prose prose-base max-w-none dark:prose-invert h-full"
                                dangerouslySetInnerHTML={{
                                  __html: sanitizeHtml(
                                    selectedSubtaskInGroup.comment.startsWith("\n")
                                      ? selectedSubtaskInGroup.comment.substring(1)
                                      : selectedSubtaskInGroup.comment
                                  ),
                                }}
                                style={{
                                  userSelect: "none",
                                  cursor: "default",
                                  whiteSpace: "pre-wrap",
                                  wordBreak: "break-word",
                                  overflowWrap: "break-word",
                                }}
                              />
                            ) : (
                              <div className="bg-muted/30 p-4 text-center text-muted-foreground h-full flex items-center justify-center">
                                담당자가 작성한 내용이 없습니다
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="bg-muted/30 p-4 text-center text-muted-foreground h-full flex items-center justify-center">
                            서브태스크를 선택하세요
                          </div>
                        )}
                      </div>
                      <div className="w-[240px] bg-muted/30 overflow-y-auto custom-scrollbar p-3 space-y-3">
                        {isLoadingSubtasks ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          </div>
                        ) : (
                          group.tasks.map((subtask) => (
                            <StaffSessionBlock
                              key={subtask.id}
                              subtask={subtask}
                              isSelected={selectedSubtaskInGroup?.id === subtask.id}
                              isCompleting={isCompletingSubtask}
                              onSelect={() =>
                                setSelectedSubtaskIdBySubtitle((prev) => ({
                                  ...prev,
                                  [group.subtitle]: prev[group.subtitle] === subtask.id ? null : subtask.id,
                                }))
                              }
                              onComplete={completeSubtask}
                              canCompleteSubtask={canEditTask}
                              canRevertAwaitingToPending={canEditTask}
                              onRevertAwaitingToPending={handleRevertSubtaskToPending}
                              isReverting={revertingSubtaskId === subtask.id}
                              hasAttachment={subtaskIdsWithResolvedFiles.has(subtask.id)}
                              isMyBlock={subtask.assigned_to === me?.id}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                  {/* 그룹별 첨부파일 — 선택한 담당자별 요청자 첨부 + 담당자 첨부 */}
                  {(() => {
                    const groupSubtaskIds = new Set(group.tasks.map((t) => t.id))
                    const selectedIdInGroup = selectedSubtaskIdBySubtitle[group.subtitle] ?? null
                    // 요청자 첨부: 담당자 선택 시 해당 담당자(subtask) 것만, 미선택 시 그룹 전체. s3Key 기준 중복 제거. presigned(s3_key) 제외
                    const presignedKey = s3Update?.s3_key ?? null
                    const groupRequesterFilesRaw = resolvedSubtaskFileKeys.filter((f) => {
                      if (presignedKey && f.s3Key === presignedKey) return false
                      if (!groupSubtaskIds.has(f.subtaskId) || f.assignedToName !== "요청자") return false
                      if (selectedIdInGroup) return f.subtaskId === selectedIdInGroup
                      return true
                    })
                    const groupRequesterFiles = Array.from(
                      new Map(groupRequesterFilesRaw.map((f) => [f.s3Key, f])).values()
                    )
                    const groupAssigneeFiles = resolvedSubtaskFileKeys.filter((f) => {
                      if (presignedKey && f.s3Key === presignedKey) return false
                      return groupSubtaskIds.has(f.subtaskId) && f.assignedToName !== "요청자"
                    })
                    const hasRequester = resolvedFileKeysForDisplay.length > 0
                    const hasGroupRequester = groupRequesterFiles.length > 0
                    const hasAssignee = groupAssigneeFiles.length > 0
                    if (!hasRequester && !hasGroupRequester && !hasAssignee) return null
                    return (
                      <div className="space-y-3 pt-4 mt-4 border-t">
                        <div className="flex items-center gap-2">
                          {showNewForGroup(group.subtitle) && (
                            <span className="inline-flex items-center gap-0.5 shrink-0 text-amber-600 dark:text-amber-400 text-[10px] font-semibold uppercase tracking-wide">
                              New
                            </span>
                          )}
                          <h4 className="text-sm font-semibold text-foreground/90">첨부파일</h4>
                        </div>
                        {isDownloading && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span className="truncate">다운로드 중: {downloadingFileName}</span>
                              <span className="shrink-0">{downloadProgress}%</span>
                            </div>
                            <Progress value={downloadProgress} />
                          </div>
                        )}
                        {hasRequester && (
                          <div className="space-y-1.5">
                            <p className="text-xs font-medium text-muted-foreground">{task.assigned_by_name || "요청자"} 첨부 (메인)</p>
                            <div className="flex flex-col gap-2 pl-2">
                              {resolvedFileKeysForDisplay.map((f, index) => (
                                <FileListItem
                                  key={`g-req-${group.subtitle}-${index}`}
                                  fileName={f.fileName}
                                  s3Key={f.s3Key}
                                  uploadedAt={f.uploadedAt}
                                  fallbackDate={task.created_at}
                                  assignedToName={task.assigned_by_name || "요청자"}
                                  assigneeColorClass={getAssigneeColorClass(task.assigned_by_name || "요청자")}
                                  onDownload={handleDownload}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                        {hasGroupRequester && (
                          <div className="space-y-1.5">
                            <p className="text-xs font-medium text-muted-foreground">요청자 첨부</p>
                            <div className="flex flex-col gap-2 pl-2">
                              {groupRequesterFiles.map((f, index) => (
                                <div key={`g-sreq-${group.subtitle}-${index}`} className="flex items-center gap-1.5">
                                  <FileListItem
                                    fileName={f.fileName}
                                    s3Key={f.s3Key}
                                    uploadedAt={f.uploadedAt}
                                    fallbackDate={task.created_at}
                                    assignedToName="요청자"
                                    assigneeColorClass={getAssigneeColorClass("요청자")}
                                    onDownload={handleDownload}
                                  />
                                  {showNewForGroup(group.subtitle) && newAttachedKeysPerGroup[group.subtitle]?.includes(f.s3Key) && (
                                    <span className="inline-flex items-center gap-0.5 shrink-0 text-amber-600 dark:text-amber-400 text-[10px] font-medium animate-pulse">
                                      <Sparkles className="h-3 w-3" />
                                      New
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {hasAssignee && (
                          <div className="space-y-1.5">
                            <p className="text-xs font-medium text-muted-foreground">담당자 첨부</p>
                            <div className="flex flex-col gap-2 pl-2">
                              {groupAssigneeFiles.map((f, index) => (
                                <FileListItem
                                  key={`g-ast-${group.subtitle}-${index}`}
                                  fileName={f.fileName}
                                  s3Key={f.s3Key}
                                  uploadedAt={f.uploadedAt}
                                  fallbackDate={task.updated_at}
                                  assignedToName={f.assignedToName}
                                  assigneeColorClass={getAssigneeColorClass(f.assignedToName)}
                                  onDownload={handleDownload}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                    </>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </>
      )}
        </div>
      )}

      {/* 스타일 */}
      <style jsx global>{`
        #worklist-content-display table,
        #worklist-content-display-joint table,
        #worklist-subtask-content table {
          border-collapse: collapse;
          width: 100%;
          margin: 10px 0;
          border: 2px solid #6b7280;
        }
        #worklist-content-display table td,
        #worklist-content-display table th,
        #worklist-content-display-joint table td,
        #worklist-content-display-joint table th,
        #worklist-subtask-content table td,
        #worklist-subtask-content table th {
          border: 2px solid #6b7280;
          padding: 8px;
          cursor: default !important;
          pointer-events: none;
          user-select: none;
        }
        #worklist-content-display hr,
        #worklist-content-display-joint hr,
        #worklist-subtask-content hr {
          border: none;
          border-top: 2px solid #9ca3af;
          margin: 10px 0;
        }
        /* 요청자 내용 편집 에디터 */
        #requester-content-editor:empty:before,
        #my-comment-editor:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
        #requester-content-editor table {
          border-collapse: collapse;
          width: 100%;
          margin: 10px 0;
          border: 2px solid #6b7280;
        }
        #requester-content-editor table td,
        #requester-content-editor table th {
          border: 2px solid #6b7280;
          padding: 8px;
          position: relative;
        }
        #requester-content-editor table td u,
        #requester-content-editor table th u,
        #requester-content-editor table td[style*="underline"],
        #requester-content-editor table th[style*="underline"] {
          text-decoration: none !important;
        }
        #requester-content-editor hr {
          border: none;
          border-top: 2px solid #9ca3af;
          margin: 10px 0;
        }
        table[data-resizable="true"] td[contenteditable="true"] u,
        table[data-resizable="true"] th[contenteditable="true"] u,
        table[data-resizable="true"] td[contenteditable="true"][style*="underline"],
        table[data-resizable="true"] th[contenteditable="true"][style*="underline"] {
          text-decoration: none !important;
        }
        
        /* 스크롤바 스타일 */
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.05);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.3);
        }
        
        /* 다크모드 스크롤바 */
        .dark .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
      `}</style>

      {/* 댓글 - 말풍선 스타일 */}
      <div className="mb-6 rounded-xl border bg-muted/20 overflow-hidden flex flex-col" style={{ minHeight: "280px" }}>
        <div className="flex-1 max-h-[320px] overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">아직 댓글이 없습니다.</p>
          ) : (
            comments.map((c) => {
              const canDelete = (me?.id && c.user_id === me.id) || userRole === "admin" || userRole === "staff"
              const isMe = me?.id && c.user_id === me.id

              // 공동사용자별 말풍선 색 (등장 순서로 고정)
              const userOrder = Array.from(new Set(comments.map((x) => x.user_id)))
              const userIndex = userOrder.indexOf(c.user_id)
              const bubbleColors = [
                "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
                "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
                "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
                "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
                "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-200",
                "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200",
              ]
              const bubbleClass = isMe
                ? "bg-primary text-primary-foreground"
                : bubbleColors[userIndex % bubbleColors.length]

              return (
                <div
                  key={c.id}
                  className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                >
                  <div className={`flex flex-col max-w-[85%] sm:max-w-[75%] ${isMe ? "items-end" : "items-start"}`}>
                    <div className="flex items-center gap-2 px-2 mb-1">
                      <span className="text-[11px] font-medium text-foreground/90">
                        {c.full_name || "사용자"}
                      </span>
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
                          onClick={() => handleDeleteComment(c.id)}
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

        {userRole !== "client" && (
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
                  if (newComment.trim() && !isPostingComment) handlePostComment()
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
        )}
        {userRole === "client" && (
          <div className="border-t bg-muted/30 p-4 text-center text-sm text-muted-foreground">
            댓글은 작업 진행 페이지에서만 작성할 수 있습니다
          </div>
        )}
      </div>

      {/* 첨부파일 — 개별 업무일 때 수정 모드가 아닐 때 하단에 표시 (저장 후 확인용) */}
      {subtasks.length === 0 && !isEditingRequesterContent && (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>첨부파일</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {isDownloading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate">다운로드 중: {downloadingFileName}</span>
                  <span className="shrink-0">{downloadProgress}%</span>
                </div>
                <Progress value={downloadProgress} />
              </div>
            )}
            
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground/90">요청자 첨부파일</h4>
              {resolvedFileKeysForDisplay.length > 0 ? (
                <div className="flex flex-col gap-2 pl-2">
                  {resolvedFileKeysForDisplay.map((f, index) => (
                    <FileListItem
                      key={`admin-${index}`}
                      fileName={f.fileName}
                      s3Key={f.s3Key}
                      uploadedAt={f.uploadedAt}
                      fallbackDate={task.created_at}
                      assignedToName={task.assigned_by_name || "요청자"}
                      assigneeColorClass={getAssigneeColorClass(task.assigned_by_name || "요청자")}
                      onDownload={handleDownload}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground pl-2">첨부파일이 없습니다</p>
              )}
            </div>
            
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground/90">담당자 첨부파일</h4>
              {resolvedCommentFileKeys.length > 0 ? (
                <div className="flex flex-col gap-2 pl-2">
                  {resolvedCommentFileKeys.map((f, index) => (
                    <FileListItem
                      key={`user-${index}`}
                      fileName={f.fileName}
                      s3Key={f.s3Key}
                      uploadedAt={f.uploadedAt}
                      fallbackDate={task.updated_at}
                      assignedToName={task.assigned_to_name || "담당자"}
                      assigneeColorClass={getAssigneeColorClass(task.assigned_to_name || "담당자")}
                      onDownload={handleDownload}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground pl-2">첨부파일이 없습니다</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* 작업완료 버튼: 담당자(admin = staff 동일)에게 항상 표시 (미완료 작업만). 완료대기일 때 옆에 업무 재요청 버튼 */}
      {canEditTask &&
       (userRole === "admin" || userRole === "staff") &&
       task.status !== "completed" && (
        <div className="mt-10 flex justify-center gap-3 flex-wrap">
          {task.status === "awaiting_completion" && (
            <Button
              variant="outline"
              onClick={handleRevertMainTaskToPending}
              disabled={revertingMainTaskToPending}
              className="min-w-[140px] cursor-pointer"
            >
              {revertingMainTaskToPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  처리 중...
                </>
              ) : (
                "업무 재요청"
              )}
            </Button>
          )}
          <Button onClick={handleFinalizeTask} disabled={isFinalizing} className="min-w-[180px] cursor-pointer">
            {isFinalizing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                처리 중...
              </>
            ) : (
              "작업완료"
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
