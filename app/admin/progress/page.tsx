"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { Loader2, CheckCircle2, Clock, Pause, FileText, AlertCircle, Check, X, Trash2, Bold, Italic, Underline, Minus, Grid3x3 as TableIcon, Upload, Edit, Download, Calendar as CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { sanitizeHtml } from "@/lib/utils/sanitize"
import { SafeHtml } from "@/components/safe-html"
import { Calendar } from "@/components/ui/calendar"
import { Progress } from "@/components/ui/progress"
import { useSearchParams } from "next/navigation"
import { format } from "date-fns"
import { ko } from "date-fns/locale"
import { uploadWithProgress } from "@/lib/utils/upload-with-progress"
import { downloadWithProgress } from "@/lib/utils/download-with-progress"
import { calculateFileExpiry, formatDateShort, parseDateOnly } from "@/lib/utils/dateHelpers"
import { Task, TaskStatus, ResolvedFileKey } from "./types"
import TaskBlock from "./components/TaskBoard/TaskBlock"
import { TaskCommentSection, TaskDetailDialog, normalizeFileKeys } from "@/components/task"
import { S3BucketInfoCard } from "@/components/s3-bucket-info-card"
import { useWorkEditor } from "./hooks/useWorkEditor"
import { useCommentEditor } from "./hooks/useCommentEditor"
import { safeStorage } from "@/lib/utils/safeStorage"

export default function AdminProgressPage() {
  const searchParams = useSearchParams()
  const fromWorklist = searchParams.get("from") === "worklist"

  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null)
  const [draggedTask, setDraggedTask] = useState<Task | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [finalizedTaskIds, setFinalizedTaskIds] = useState<Set<string>>(new Set())
  const [userRole, setUserRole] = useState<string | null>(null)
  const { toast } = useToast()
  
  // 작업공간 상태
  const [workForm, setWorkForm] = useState({
    title: "",
    content: "",
    priority: "medium",
  })
  const [workTaskId, setWorkTaskId] = useState<string | null>(null)
  const [workTaskIsSubtask, setWorkTaskIsSubtask] = useState(false)
  const [workAttachedFiles, setWorkAttachedFiles] = useState<File[]>([])
  const [workResolvedFileKeys, setWorkResolvedFileKeys] = useState<ResolvedFileKey[]>([])
  const [isUploadingWork, setIsUploadingWork] = useState(false)
  const [workUploadProgress, setWorkUploadProgress] = useState(0)
  const [isWorkAreaDragOver, setIsWorkAreaDragOver] = useState(false)
  const [isWorkAreaReadOnly, setIsWorkAreaReadOnly] = useState(false)
  
  // 댓글 에디터 상태
  const [workCommentContent, setWorkCommentContent] = useState("")
  const [workCommentFiles, setWorkCommentFiles] = useState<File[]>([])
  const [workCommentResolvedFileKeys, setWorkCommentResolvedFileKeys] = useState<ResolvedFileKey[]>([])
  
  // Editor hooks
  const workEditor = useWorkEditor(workForm, setWorkForm)
  const { 
    editorState: workCommentEditorState, 
    updateEditorState: updateCommentEditorState,
    tableGridHover: workCommentTableGridHover,
    setTableGridHover: setWorkCommentTableGridHover,
    createTable: createCommentTable,
    addResizeHandlersToTable: addResizeHandlersToCommentTable
  } = useCommentEditor(setWorkCommentContent)
  
  // 작업공간 탭 모드 (개별/공동)
  const [contentMode, setContentMode] = useState<'main' | 'add'>('add')
  // 작업공간 마감일 수정 팝오버 (undefined=서버 값 그대로, null=해제 선택, Date=선택한 날짜)
  const [workDueDatePopoverOpen, setWorkDueDatePopoverOpen] = useState(false)
  const [workDueDatePickerValue, setWorkDueDatePickerValue] = useState<Date | null | undefined>(undefined)
  /** 작업공간에 표시 중인 task에 연결된 s3_update (버킷 카드 표시용) */
  const [workAreaS3Update, setWorkAreaS3Update] = useState<{
    id: number
    file_name: string
    bucket_name?: string | null
    file_size?: number | null
    upload_time?: string | null
    created_at: string
    s3_key: string
  } | null>(null)

  // 작업 변경 시 마감일 선택 초기화
  useEffect(() => {
    setWorkDueDatePickerValue(undefined)
  }, [workTaskId])

  // 작업공간 task에 연결된 s3_update 로드 (버킷 카드 표시)
  useEffect(() => {
    if (!workTaskId) {
      setWorkAreaS3Update(null)
      return
    }
    let cancelled = false
    fetch(`/api/tasks/${workTaskId}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (cancelled) return
        if (data?.s3Update) setWorkAreaS3Update(data.s3Update)
        else setWorkAreaS3Update(null)
      })
      .catch(() => {
        if (!cancelled) setWorkAreaS3Update(null)
      })
    return () => {
      cancelled = true
    }
  }, [workTaskId])

  // contentEditable 초기값 설정
  useEffect(() => {
    const editor = document.getElementById('work-content')
    if (editor && workForm.content && !editor.innerHTML) {
      editor.innerHTML = workForm.content
    }
  }, [])

  // 첨부파일 추가 등으로 리렌더 시 작성 내용(contentEditable)이 비어 있으면 state에서 복원
  useEffect(() => {
    if (!workTaskId) return
    const t = setTimeout(() => {
      const commentEl = document.getElementById("work-comment-content")
      if (commentEl && workCommentContent.trim() && !commentEl.innerHTML.trim()) {
        commentEl.innerHTML = workCommentContent
      }
      const workEl = document.getElementById("work-content")
      if (workEl && workForm.content.trim() && !workEl.innerHTML.trim()) {
        workEl.innerHTML = workForm.content
      }
    }, 0)
    return () => clearTimeout(t)
  }, [workTaskId, workCommentFiles.length, workCommentResolvedFileKeys.length, workCommentContent, workForm.content])

  useEffect(() => {
    const loadUser = async () => {
      try {
        const response = await fetch("/api/auth/me", { credentials: "include" })
        if (!response.ok) {
          setUser(null)
          setUserRole(null)
          return
        }
        const me = await response.json()
        setUser(me)
        setUserRole(me.role || null)
      } catch (error) {
        console.error("[Progress] 사용자 로드 오류:", error)
      }
    }
    loadUser()
  }, [])

  // 참조자(shared_with) 기능 미사용: profiles 목록 로드 제거

  const clearWorkArea = useCallback((taskId?: string) => {
    // 작업공간 상태 초기화
    setWorkTaskId(null)
    setWorkAreaS3Update(null)
    setWorkDueDatePopoverOpen(false)
    setIsWorkAreaReadOnly(false)
    setWorkForm({ title: "", content: "", priority: "medium" })
    setWorkAttachedFiles([])
    setWorkResolvedFileKeys([])
    setIsUploadingWork(false)

    // 댓글 작업공간 초기화
    setWorkCommentContent("")
    setWorkCommentFiles([])
    setWorkCommentResolvedFileKeys([])

    // 에디터 DOM 초기화
    const editor = document.getElementById("work-content")
    if (editor) editor.innerHTML = ""
    const commentEditorEl = document.getElementById("work-comment-content")
    if (commentEditorEl) commentEditorEl.innerHTML = ""

    // 임시저장 데이터가 있다면 제거(선택, 저장소 접근 불가 시 무시)
    if (taskId) {
      safeStorage.removeItem(`work-comment-temp-${taskId}`)
    }
  }, [])

  // Progress 데이터 소스 vs Worklist(cases) 경계:
  // - Progress: /api/tasks(내가 담당자) + /api/tasks/assigned-by(내가 요청자). staff끼리 할당해도
  //   담당자는 Progress '요청받은 업무'에, 요청자는 '내가 요청한 업무'에 표시됨.
  // - Worklist(admin/cases): /api/tasks/all → admin/staff 전원이 전체 task 목록 조회.
  //   따라서 할당받은 업무는 Progress와 Worklist 둘 다에 나타남. Progress는 '내 업무' 뷰, Worklist는 '전체 케이스' 뷰.
  const loadTasks = useCallback(async () => {
    setIsLoading(true)
    try {
      const [receivedRes, requestedRes] = await Promise.all([
        fetch("/api/tasks", { credentials: "include" }),
        fetch("/api/tasks/assigned-by", { credentials: "include" }),
      ])

      if (!receivedRes.ok) {
        const errorText = await receivedRes.text()
        throw new Error("Task 목록을 불러오는데 실패했습니다")
      }

      const receivedData = await receivedRes.json()
      const receivedTasks: Task[] = Array.isArray(receivedData.tasks) ? receivedData.tasks : []
      const requestedData = requestedRes.ok ? await requestedRes.json() : { tasks: [] }
      const requestedTasks: Task[] = Array.isArray(requestedData.tasks) ? requestedData.tasks : []

      const receivedIds = new Set(receivedTasks.map((t) => t.id))
      const withTypeReceived = receivedTasks.map((t) => ({ ...t, taskType: "received" as const }))
      const withTypeRequested = requestedTasks
        .filter((t) => !receivedIds.has(t.id))
        .map((t) => ({ ...t, taskType: "requested" as const }))
      const merged = [...withTypeReceived, ...withTypeRequested].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )

      setTasks(merged)
    } catch (error: any) {
      console.error("[Progress] Task 로드 오류:", error)
      toast({
        title: "오류",
        description: error.message || "Task 목록을 불러오는데 실패했습니다",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  // 페이지 마운트 시에만 로드 (Progress 탭을 눌렀을 때만 새로고침)
  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  // 케이스 상세에서 요청자 내용 수정 시 해당 task 카드 반영
  useEffect(() => {
    const handler = async (e: Event) => {
      const { taskId } = (e as CustomEvent<{ taskId: string }>).detail
      try {
        const res = await fetch(`/api/tasks/${taskId}`, { credentials: "include" })
        if (!res.ok) return
        const data = await res.json()
        const updated = data.task
        if (!updated) return
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, ...updated, taskType: t.taskType } : t))
        )
      } catch {
        // 무시
      }
    }
    window.addEventListener("task-content-updated", handler)
    return () => window.removeEventListener("task-content-updated", handler)
  }, [])

  // 다른 탭에서 수정 후 이 탭으로 돌아오면 목록 새로고침
  useEffect(() => {
    const onFocus = () => loadTasks()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [loadTasks])

  // 공동업무: 같은 task_id인 서브태스크를 메인 하나로 병합 (handleStatusChange 등에서 사용하므로 상단 정의)
  const displayTasks = useMemo(() => {
    const groupKey = (t: Task) => (t.is_subtask && t.task_id ? t.task_id : t.id)
    const groups = new Map<string, Task[]>()
    for (const t of tasks) {
      const key = groupKey(t)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(t)
    }
    const result: Task[] = []
    for (const [, group] of groups) {
      if (group.length === 1 && !group[0].is_subtask) {
        result.push(group[0])
        continue
      }
      if (group.length === 1 && group[0].is_subtask) {
        result.push(group[0])
        continue
      }
      const first = group[0]
      const mergedContent = group
        .map((s) => `[${s.subtitle || "담당"}]\n${s.content || ""}`.trim())
        .filter(Boolean)
        .join("\n\n")
      const mergedFileKeys = [...new Set((group.flatMap((s) => s.file_keys || []) as string[]))]
      const mergedCommentFileKeys = [...new Set((group.flatMap((s) => (s.comment_file_keys || []) as string[])))]
      result.push({
        ...first,
        id: first.id,
        content: mergedContent || first.content,
        file_keys: mergedFileKeys.length ? mergedFileKeys : first.file_keys,
        comment_file_keys: mergedCommentFileKeys.length ? mergedCommentFileKeys : first.comment_file_keys,
        _subtaskIds: group.map((t) => t.id),
      })
    }
    return result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }, [tasks])

  const handleStatusChange = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    setUpdatingTaskId(taskId)
    try {
      // displayTasks에서 병합된 task 포함해 조회 (공동업무 시 _subtaskIds 사용)
      const task = displayTasks.find((t) => t.id === taskId) ?? tasks.find((t) => t.id === taskId)
      const idsToUpdate = task?._subtaskIds?.length ? task._subtaskIds : [taskId]

      for (const id of idsToUpdate) {
        const raw = tasks.find((t) => t.id === id)
        const response = await fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            status: newStatus,
            is_subtask: raw?.is_subtask ?? false,
          }),
        })
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || "상태 업데이트 실패")
        }
      }

      if (workTaskId === taskId) {
        clearWorkArea(taskId)
      }

      await loadTasks()
      toast({
        title: "상태 업데이트 완료",
        description: "Task 상태가 변경되었습니다",
      })
    } catch (error: any) {
      toast({
        title: "오류",
        description: error.message || "상태 업데이트에 실패했습니다",
        variant: "destructive",
      })
    } finally {
      setUpdatingTaskId(null)
    }
  }, [clearWorkArea, loadTasks, toast, workTaskId, tasks, displayTasks])

  const handleDragStart = useCallback((e: React.DragEvent, task: Task) => {
    setDraggedTask(task)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", task.id)
    e.dataTransfer.setData("application/json", JSON.stringify({ taskId: task.id }))
    // 드래그 이미지가 없으면 일부 브라우저에서 드래그가 취소될 수 있음
    if (e.dataTransfer.setDragImage && e.currentTarget instanceof HTMLElement) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      e.dataTransfer.setDragImage(e.currentTarget as HTMLElement, Math.min(rect.width / 2, 80), 20)
    }
  }, [])

  const handleDragEnd = useCallback(() => {
    // 드래그가 끝났을 때 약간의 지연 후 상태 초기화 (드롭 이벤트가 먼저 처리되도록)
    setTimeout(() => {
      setDraggedTask(null)
    }, 100)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDragOverStatus(status)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverStatus(null)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault()
    setDragOverStatus(null)

    if (!draggedTask) return

    // 같은 상태로 드롭하면 무시
    if (draggedTask.status === targetStatus) {
      setDraggedTask(null)
      return
    }

    // 상태 변경
    await handleStatusChange(draggedTask.id, targetStatus)
    setDraggedTask(null)
  }, [draggedTask, handleStatusChange])

  // 작업공간 드래그 오버 핸들러
  const handleWorkAreaDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // 드롭 가능한 커서로 변경 (copy 또는 move)
    if (e.dataTransfer.effectAllowed === "all" || e.dataTransfer.effectAllowed.includes("copy")) {
      e.dataTransfer.dropEffect = "copy"
    } else if (e.dataTransfer.effectAllowed.includes("move")) {
      e.dataTransfer.dropEffect = "move"
    } else {
      e.dataTransfer.dropEffect = "copy"
    }
    setIsWorkAreaDragOver(true)
  }, [])

  // 작업공간 드래그 리브 핸들러
  const handleWorkAreaDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // 자식 요소로 이동한 경우는 무시
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return
    }
    setIsWorkAreaDragOver(false)
  }, [])

  // 작업공간 드롭 핸들러
  const handleWorkAreaDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsWorkAreaDragOver(false)

    if (!draggedTask) return

    // 작업공간에 task 정보 표시 (읽기 전용)
    setWorkForm({
      title: draggedTask.title || "",
      content: draggedTask.content || "",
      priority: draggedTask.priority || "medium",
    })
    setWorkTaskId(draggedTask.id)
    setIsWorkAreaReadOnly(true) // 드롭으로 추가한 경우 읽기 전용

    // 첨부파일이 있으면 resolve
    if (draggedTask.file_keys && draggedTask.file_keys.length > 0) {
      try {
        const response = await fetch('/api/storage/resolve-file-keys', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ fileKeys: draggedTask.file_keys }),
        })
        if (response.ok) {
          const data = await response.json()
          setWorkResolvedFileKeys(data.resolvedKeys || [])
        }
      } catch (error) {
        console.error('파일 키 resolve 오류:', error)
        setWorkResolvedFileKeys([])
      }
    } else {
      setWorkResolvedFileKeys([])
    }

    // comment 첨부파일이 있으면 resolve
    if (draggedTask.comment_file_keys && draggedTask.comment_file_keys.length > 0) {
      try {
        const response = await fetch('/api/storage/resolve-file-keys', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ fileKeys: draggedTask.comment_file_keys }),
        })
        if (response.ok) {
          const data = await response.json()
          setWorkCommentResolvedFileKeys(data.resolvedKeys || [])
        }
      } catch (error) {
        console.error('comment 파일 키 resolve 오류:', error)
        setWorkCommentResolvedFileKeys([])
      }
    } else {
      setWorkCommentResolvedFileKeys([])
    }

    // contentEditable에 내용 설정
    setTimeout(() => {
      const editor = document.getElementById('work-content')
      if (editor && draggedTask.content) {
        editor.innerHTML = draggedTask.content
      }
      
      // comment 에디터에 내용 설정
      const commentEditor = document.getElementById('work-comment-content')
      if (commentEditor) {
        // comment 컬럼에서 첫 줄 개행 제거하여 표시
        const commentText = (draggedTask.comment as string) || ""
        const commentEditorEl = document.getElementById('work-comment-content')
        if (commentEditorEl) commentEditorEl.innerHTML = commentText.startsWith('\n') ? commentText.substring(1) : commentText
        setWorkCommentContent(commentText.startsWith('\n') ? commentText.substring(1) : commentText)
      }
    }, 0)

    // 드래그 상태 초기화
    setDraggedTask(null)
  }, [draggedTask])

  const getPriorityColor = (priority: Task['priority']) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-500 text-white'
      case 'high':
        return 'bg-orange-500 text-white'
      case 'medium':
        return 'bg-yellow-500 text-white'
      case 'low':
        return 'bg-blue-500 text-white'
      default:
        return 'bg-gray-500 text-white'
    }
  }

  const getStatusIcon = (status: Task['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'awaiting_completion':
        return <CheckCircle2 className="h-4 w-4 text-purple-500" />
      case 'in_progress':
        return <Clock className="h-4 w-4 text-blue-500" />
      case 'on_hold':
        return <Pause className="h-4 w-4 text-yellow-500" />
      case 'pending':
        return <AlertCircle className="h-4 w-4 text-gray-500" />
      default:
        return null
    }
  }

  const getStatusLabel = (status: Task['status'], task?: Task) => {
    switch (status) {
      case 'completed':
        return '완료'
      case 'awaiting_completion':
        return '완료대기'
      case 'in_progress':
        return '작업'
      case 'on_hold':
        return '보류'
      case 'pending':
        return '대기'
      default:
        return status
    }
  }

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case 'completed':
        return 'border-green-500 bg-green-50/50 dark:bg-green-950/20'
      case 'awaiting_completion':
        return 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/20'
      case 'in_progress':
        return 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
      case 'on_hold':
        return 'border-yellow-500 bg-yellow-50/50 dark:bg-yellow-950/20'
      case 'pending':
        return 'border-gray-500 bg-gray-50/50 dark:bg-gray-950/20'
    }
  }

  // 상태별로 task 분류 — displayTasks 기준 (공동업무는 메인 하나로 표시)
  const pendingTasks = useMemo(() => 
    displayTasks.filter(t => t.status === 'pending').sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ), [displayTasks]
  )
  const inProgressTasks = useMemo(() => 
    displayTasks.filter(t => t.status === 'in_progress' && t.taskType !== 'requested').sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ), [displayTasks]
  )
  const onHoldTasks = useMemo(() => 
    displayTasks.filter(t => t.status === 'on_hold' && t.taskType !== 'requested').sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ), [displayTasks]
  )
  const awaitingCompletionTasks = useMemo(() => 
    displayTasks.filter(t => t.status === 'awaiting_completion' && t.taskType !== 'requested').sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ), [displayTasks]
  )

  // 완료대기 탭에서 finalized된 task 제외
  const filteredAwaitingCompletionTasks = useMemo(() => 
    awaitingCompletionTasks.filter(t => !finalizedTaskIds.has(t.id)), 
    [awaitingCompletionTasks, finalizedTaskIds]
  )

  // 대기(pending) 업무 — 요청받은 것 (displayTasks 기준)
  const receivedPendingTasks = useMemo(
    () =>
      displayTasks
        .filter((t) => t.status === "pending" && t.taskType !== "requested")
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [displayTasks],
  )
  // 내가 요청한 업무 전체 (공동업무 지시 포함) — displayTasks 기준
  const requestedTasks = useMemo(
    () =>
      displayTasks
        .filter((t) => t.taskType === "requested")
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [displayTasks],
  )
  const statusColumns = useMemo<Array<{ status: TaskStatus; label: string; tasks: Task[]; icon: React.ReactElement }>>(() => [
    {
      status: 'in_progress',
      label: '작업',
      tasks: inProgressTasks,
      icon: <Clock className="h-5 w-5 text-blue-500" />
    },
    {
      status: 'on_hold',
      label: '보류',
      tasks: onHoldTasks,
      icon: <Pause className="h-5 w-5 text-yellow-500" />
    },
    {
      status: 'awaiting_completion',
      label: '완료대기',
      tasks: filteredAwaitingCompletionTasks,
      icon: <CheckCircle2 className="h-5 w-5 text-purple-500" />
    }
  ], [inProgressTasks, onHoldTasks, filteredAwaitingCompletionTasks])

  return (
    <div className="relative mx-auto max-w-7xl p-6">
      <div className="mb-8">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-bold">Progress</h1>
          <Badge variant="secondary" className="text-sm font-medium">관리자</Badge>
          {fromWorklist && (
            <Badge variant="outline" className="text-sm font-normal">Worklist에서 이동</Badge>
          )}
        </div>
        <p className="text-muted-foreground mt-2">요청하거나 받은 업무를 드래그하여 상태를 변경할 수 있습니다</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* 요청하거나 받은 업무 — 파랑: 요청받은, 주황: 내가 요청한(공동업무 포함) */}
          <div className="mb-8 min-w-0">
            <div className="pl-4 border-l-4 border-border flex flex-col min-w-0">
              <h2 className="text-xl font-semibold mb-1 shrink-0">요청하거나 받은 업무</h2>
              <p className="text-sm text-muted-foreground mb-2 shrink-0">
                <span className="text-blue-600 dark:text-blue-400 font-medium">파란색</span>: 요청받은 업무(대기 중) · <span className="text-amber-600 dark:text-amber-400 font-medium">주황색</span>: 내가 요청한 업무(공동업무 지시 포함)
              </p>
              <div className="min-h-[88px] max-h-[320px] overflow-auto pr-1">
              {receivedPendingTasks.length > 0 || requestedTasks.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {receivedPendingTasks.map((task) => (
                  <Card
                    key={task.id}
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, task)}
                    onDragEnd={handleDragEnd}
                    className={`select-none rounded-lg shadow-sm hover:shadow-md transition-all bg-linear-to-br from-background to-muted/30 hover:from-background hover:to-muted/50 border-l-4 border-l-blue-500 border-2 border-blue-500/30 hover:border-blue-500 ${
                      draggedTask?.id === task.id ? 'opacity-50 scale-95 cursor-grabbing' : 'opacity-100 cursor-grab'
                    } ${
                      workTaskId === task.id ? 'ring-2 ring-gray-400 ring-offset-1 border-gray-400' : ''
                    }`}
                    onClick={(e) => {
                      if (!draggedTask || draggedTask.id !== task.id) setSelectedTask(task)
                    }}
                  >
                    <CardContent className="p-2 pointer-events-none">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-semibold text-xs truncate" title={task.title}>
                            {task.title}
                            {task.subtitle && task.is_subtask && (
                              <span className="text-muted-foreground ml-1.5">({task.subtitle})</span>
                            )}
                          </h4>
                          <Badge className={`${getPriorityColor(task.priority)} text-[9px] px-1.5 py-0.5 font-medium shrink-0`} variant="outline">
                            {task.priority === 'urgent' ? '긴급' : task.priority === 'high' ? '높음' : task.priority === 'medium' ? '보통' : '낮음'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="truncate text-[10px] text-muted-foreground">{task.assigned_by_name || task.assigned_by_email}</span>
                          <span className="whitespace-nowrap text-[10px] text-muted-foreground">{new Date(task.created_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  ))}
                  {requestedTasks.map((task) => (
                  <Card
                    key={task.id}
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, task)}
                    onDragEnd={handleDragEnd}
                    className={`select-none rounded-lg shadow-sm hover:shadow-md transition-all bg-linear-to-br from-background to-muted/30 hover:from-background hover:to-muted/50 border-l-4 border-l-amber-500 border-2 border-amber-500/30 hover:border-amber-500 ${
                      workTaskId === task.id ? 'ring-2 ring-gray-400 ring-offset-1 border-gray-400' : 'cursor-grab'
                    } ${
                      draggedTask?.id === task.id ? 'opacity-50 scale-95 cursor-grabbing' : ''
                    }`}
                    onClick={(e) => {
                      if (!draggedTask || draggedTask.id !== task.id) setSelectedTask(task)
                    }}
                  >
                    <CardContent className="p-2 pointer-events-none">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-semibold text-xs truncate" title={task.title}>
                            {task.title}
                            {task.subtitle && task.is_subtask && (
                              <span className="text-muted-foreground ml-1.5">({task.subtitle})</span>
                            )}
                          </h4>
                          <Badge className={`${getPriorityColor(task.priority)} text-[9px] px-1.5 py-0.5 font-medium shrink-0`} variant="outline">
                            {task.priority === 'urgent' ? '긴급' : task.priority === 'high' ? '높음' : task.priority === 'medium' ? '보통' : '낮음'}
                          </Badge>
                          <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0 text-muted-foreground">
                            {getStatusLabel(task.status)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="truncate text-[10px] text-muted-foreground">{task.assigned_to_name || task.assigned_to_email || '담당자'}</span>
                          <span className="whitespace-nowrap text-[10px] text-muted-foreground">{new Date(task.created_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  요청하거나 받은 업무가 없습니다.
                </div>
              )}
              </div>
            </div>
          </div>

          {/* 구분선: 받은 업무 vs 상태 보드 */}
          <div className="my-8 border-t border-border/60" />

          {/* 상태별 칸반 보드 */}
          <div className="grid gap-6 lg:grid-cols-3">
            {statusColumns.map((column) => (
              <div key={column.status} className="relative">
                {column.status === 'awaiting_completion' && filteredAwaitingCompletionTasks.length > 0 && (
                  <p className="text-sm text-muted-foreground mb-2 absolute -top-6 left-1/2 -translate-x-1/2 w-full text-center"></p>
                )}
                <Card
                  data-status={column.status}
                  className={`transition-colors ${
                    dragOverStatus === column.status
                      ? getStatusColor(column.status)
                      : ''
                  }`}
                  onDragOver={(e) => handleDragOver(e, column.status)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, column.status)}
                >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {column.icon}
                    {column.label}
                    <span className="text-sm font-normal text-muted-foreground">({column.tasks.length}개의 작업)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {column.tasks.length > 0 ? (
                      column.tasks.map((task) => (
                        <TaskBlock
                          key={task.id}
                          task={task}
                          onStatusChange={handleStatusChange}
                          updatingTaskId={updatingTaskId}
                          getPriorityColor={getPriorityColor}
                          getStatusIcon={getStatusIcon}
                          getStatusLabel={getStatusLabel}
                          onDragStart={handleDragStart}
                          isDragging={draggedTask?.id === task.id}
                          onTaskClick={setSelectedTask}
                          workTaskId={workTaskId}
                        />
                      ))
                    ) : (
                      column.status !== 'pending' && (
                        <Card className="border-2 border-dashed py-0 gap-0">
                          <CardContent className="p-2 h-[55px] flex items-center justify-center">
                            <p className="text-sm text-muted-foreground">작업을 여기로 드래그하세요</p>
                          </CardContent>
                        </Card>
                      )
                    )}
                  </div>
                </CardContent>
              </Card>
              </div>
            ))}
          </div>
          
          {/* 작업공간 섹션 */}
          <Card 
            className={`mt-8 transition-all duration-200 ${
              isWorkAreaDragOver ? 'border-4 border-primary shadow-lg ring-2 ring-primary/20' : ''
            } ${
              workTaskId
                ? (() => {
                    const t = tasks.find((x) => x.id === workTaskId)
                    if (t?.taskType === "received") return "border-l-4 border-l-blue-500"
                    if (t?.taskType === "requested") return "border-l-4 border-l-amber-500"
                    return ""
                  })()
                : ""
            }`}
            onDragOver={handleWorkAreaDragOver}
            onDragLeave={handleWorkAreaDragLeave}
            onDrop={handleWorkAreaDrop}
          >
            <CardHeader>
              <CardTitle className="text-2xl">작업공간</CardTitle>
              <p className="text-sm text-muted-foreground mt-2">업무블록을 드래그하여 사용하세요</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-6 min-w-0 max-w-full">
                {!workTaskId ? (
                  <div
                    className="min-h-[420px] rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-3 p-8 text-center bg-muted/20"
                    style={{
                      backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 10px, rgba(0,0,0,.04) 10px, rgba(0,0,0,.04) 20px)',
                    }}
                  >
                    <p className="text-muted-foreground font-medium text-sm whitespace-nowrap">
                      이쪽에 드래그하거나, 태스크를 클릭한 뒤 <strong>작성</strong> 버튼을 눌러 내용을 작성하세요.
                    </p>
                  </div>
                ) : (
                  <>
                  {workAreaS3Update && (
                    <S3BucketInfoCard s3Update={workAreaS3Update} compact />
                  )}
                  {/* 개별/공동 업무 표시 */}
                  {(() => {
                    const currentTask = tasks.find(t => t.id === workTaskId)
                    const isMulti = currentTask?.is_multi_assign === true
                    return (
                      <div className="flex items-center gap-2 pb-2 border-b">
                        <Badge variant="secondary" className="text-sm shrink-0">
                          {isMulti ? "공동 업무" : "개별 업무"}
                        </Badge>
                      </div>
                    )
                  })()}
                {/* 제목을 comment와 동일한 너비로 설정 */}
                <div className="grid grid-cols-2 gap-4 min-w-0 max-w-full">
                  <div className="space-y-2 min-w-0 max-w-full">
                    <Label htmlFor="work-title" className="text-base font-semibold">제목 *</Label>
                    <Input
                      id="work-title"
                      placeholder="제목을 입력하세요"
                      value={workForm.title}
                      onChange={(e) => setWorkForm({ ...workForm, title: e.target.value })}
                      className={`text-base h-12 w-full max-w-full min-w-0 ${isWorkAreaReadOnly || !workTaskId ? 'bg-muted/50' : ''}`}
                      disabled={isWorkAreaReadOnly || !workTaskId}
                      readOnly={isWorkAreaReadOnly || !workTaskId}
                    />
                  </div>
                  <div></div>
                </div>
                <div className="flex flex-wrap items-end gap-4 min-w-0 max-w-full">
                  <div className="flex flex-col gap-1 min-w-0">
                    <Label htmlFor="work-priority" className="text-sm leading-none font-medium shrink-0">중요도</Label>
                    <Select
                      value={workForm.priority}
                      onValueChange={(value) => setWorkForm({ ...workForm, priority: value })}
                      disabled={isWorkAreaReadOnly || !workTaskId}
                    >
                      <SelectTrigger 
                        id="work-priority" 
                        className={`h-9 w-full min-w-[100px] ${isWorkAreaReadOnly || !workTaskId ? 'cursor-default' : 'cursor-pointer'}`}
                        style={isWorkAreaReadOnly || !workTaskId ? { cursor: 'default' } : undefined}
                      >
                        {workForm.priority === "low" && (
                          <span className="px-2 py-1 rounded bg-gray-100 text-gray-700 text-sm font-medium">낮음</span>
                        )}
                        {workForm.priority === "medium" && (
                          <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-700 text-sm font-medium">보통</span>
                        )}
                        {workForm.priority === "high" && (
                          <span className="px-2 py-1 rounded bg-orange-100 text-orange-700 text-sm font-medium">높음</span>
                        )}
                        {workForm.priority === "urgent" && (
                          <span className="px-2 py-1 rounded bg-red-100 text-red-700 text-sm font-medium">긴급</span>
                        )}
                        {!workForm.priority && (
                          <SelectValue placeholder="선택하세요" />
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low" className="cursor-pointer">
                          <span className="px-2 py-1 rounded bg-gray-100 text-gray-700 text-sm font-medium">낮음</span>
                        </SelectItem>
                        <SelectItem value="medium" className="cursor-pointer">
                          <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-700 text-sm font-medium">보통</span>
                        </SelectItem>
                        <SelectItem value="high" className="cursor-pointer">
                          <span className="px-2 py-1 rounded bg-orange-100 text-orange-700 text-sm font-medium">높음</span>
                        </SelectItem>
                        <SelectItem value="urgent" className="cursor-pointer">
                          <span className="px-2 py-1 rounded bg-red-100 text-red-700 text-sm font-medium">긴급</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {workTaskId && (() => {
                      const currentTask = tasks.find(t => t.id === workTaskId)
                      if (!currentTask) return null
                      // 서브태스크는 마감일이 부모(task_assignments)에만 있으므로 부모 ID로 PATCH 및 표시
                      const dueDatePatchId = currentTask.is_subtask && currentTask.task_id ? currentTask.task_id : workTaskId
                      const taskToUpdate = tasks.find(t => t.id === dueDatePatchId)
                      const canEditDueDate = taskToUpdate?.status !== "completed"
                      const serverDueDate = parseDateOnly(taskToUpdate?.due_date) ?? null
                      // 아이콘/달력에 표시할 날짜: 달력에서 선택한 값이 있으면 그대로, 없으면 서버 값
                      const displayDueDate = workDueDatePickerValue !== undefined ? workDueDatePickerValue : serverDueDate
                      const selectedInCalendar = workDueDatePickerValue !== undefined ? workDueDatePickerValue : serverDueDate
                      return (
                        <div className="flex flex-col items-center gap-1">
                          <Label className="text-sm leading-none font-medium shrink-0">마감일</Label>
                          <Popover open={workDueDatePopoverOpen} onOpenChange={setWorkDueDatePopoverOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size={displayDueDate ? "sm" : "icon"}
                                className={displayDueDate ? "h-9 px-2 shrink-0 gap-1.5" : "h-9 w-9 shrink-0"}
                                disabled={!canEditDueDate}
                                title={!canEditDueDate ? "완료된 작업은 마감일을 변경할 수 없습니다" : displayDueDate ? `마감일: ${format(displayDueDate, "yyyy.MM.dd", { locale: ko })} (한 번 클릭 선택, 같은 날 다시 클릭 해제)` : "마감일 선택"}
                              >
                                <CalendarIcon className="h-4 w-4 shrink-0" />
                                {displayDueDate && (
                                  <span className="text-xs font-medium tabular-nums">
                                    {format(displayDueDate, "M/d", { locale: ko })}
                                  </span>
                                )}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={selectedInCalendar ?? undefined}
                                onSelect={(date) => {
                                  if (!canEditDueDate) return
                                  const currentSelected = workDueDatePickerValue !== undefined ? workDueDatePickerValue : serverDueDate
                                  const isSameDay =
                                    currentSelected &&
                                    date &&
                                    format(currentSelected, "yyyy-MM-dd") === format(date, "yyyy-MM-dd")
                                  setWorkDueDatePickerValue(isSameDay ? null : (date ?? null))
                                }}
                                locale={ko}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      )
                    })()}
                </div>
                {/* 개별/공동 탭으로 변경 */}
                <div className="space-y-2 min-w-0 max-w-full">
                  {/* 개별/공동 슬라이딩 세그먼트 - is_multi_assign에 따라 조건부 렌더링 */}
                  {(() => {
                    const currentTask = workTaskId ? tasks.find(t => t.id === workTaskId) : null
                    const isMultiAssign = currentTask?.is_multi_assign
                    
                    // is_multi_assign이 false면 개별만, true면 공동만 표시
                    if (isMultiAssign === false) {
                      return null // 개별만 표시할 때는 탭 스위치 숨김
                    } else if (isMultiAssign === true) {
                      return null // 공동만 표시할 때는 탭 스위치 숨김
                    }
                    
                    // task가 없거나 is_multi_assign이 undefined인 경우 기본 탭 표시
                    return (
                      <div className="mb-3">
                        <div className="relative inline-flex items-center bg-muted rounded-full p-0.5 h-8 w-fit">
                          <div 
                            className="absolute h-7 rounded-full bg-background shadow-sm transition-all duration-200 ease-in-out"
                            style={{
                              width: '45px', 
                              left: contentMode === 'main' ? '2px' : '47px',
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setContentMode('main')}
                            className={`relative z-10 w-[45px] h-7 text-sm font-medium transition-colors duration-200 ${
                              contentMode === 'main' ? 'text-foreground' : 'text-muted-foreground'
                            }`}
                          >
                            개별
                          </button>
                          <button
                            type="button"
                            onClick={() => setContentMode('add')}
                            className={`relative z-10 w-[45px] h-7 text-sm font-medium transition-colors duration-200 ${
                              contentMode === 'add' ? 'text-foreground' : 'text-muted-foreground'
                            }`}
                          >
                            공동
                          </button>
                        </div>
                      </div>
                    )
                  })()}
                  
                  {/* 개별 탭 - 공동 탭과 같은 구조로 변경 */}
                  {(() => {
                    const currentTask = workTaskId ? tasks.find(t => t.id === workTaskId) : null
                    const isMultiAssign = currentTask?.is_multi_assign
                    
                    // is_multi_assign이 false이거나, undefined일 때 contentMode가 'main'인 경우 개별 탭 표시
                    const showIndividual = (isMultiAssign === false) || (isMultiAssign === undefined && contentMode === 'main')
                    
                    return showIndividual && (
                    <>
                    {/* 본문 (위에 배치, full width) */}
                    <div className="space-y-2 min-w-0 max-w-full mb-4">
                      <Label className="text-base font-semibold">본문</Label>
                      {workForm.content ? (
                        <div className="border rounded-md overflow-hidden bg-muted/30" style={{
                          height: '280px',
                          minHeight: '280px',
                          maxHeight: '280px',
                          display: 'flex',
                          flexDirection: 'column'
                        }}>
                          <div
                            id="work-content-main-readonly"
                            className="text-sm bg-muted/50 p-3 wrap-break-word word-break break-all overflow-x-auto prose prose-sm max-w-none flex-1"
                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(workForm.content) }}
                            style={{
                              minHeight: '250px',
                              overflowY: 'auto',
                              userSelect: 'text',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word'
                            }}
                            ref={(el) => {
                              if (el) {
                                const tables = el.querySelectorAll('table')
                                tables.forEach((table) => {
                                  const cells = table.querySelectorAll('td, th')
                                  cells.forEach((cell) => {
                                    (cell as HTMLElement).contentEditable = 'false'
                                  })
                                })
                              }
                            }}
                          />
                        </div>
                      ) : (
                        <div className="border rounded-md bg-muted/30 p-4 text-center text-muted-foreground" style={{
                          height: '280px',
                          minHeight: '280px',
                          maxHeight: '280px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          본문이 없습니다
                        </div>
                      )}
                      
                      {/* 요청자 첨부파일 표시 - 다운로드 기간은 요청일(작업 생성일) 기준 7일 */}
                      {workResolvedFileKeys.length > 0 && (() => {
                        const workTask = workTaskId ? tasks.find(t => t.id === workTaskId) : null
                        const requestDate = workTask?.created_at ?? null
                        const fileExpiry = calculateFileExpiry(requestDate)
                        const isFileExpired = fileExpiry.isExpired
                        return (
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold">요청자 첨부파일</Label>
                          <div className="flex flex-wrap gap-2 p-2 border border-transparent rounded-md bg-transparent">
                            {workResolvedFileKeys.map((resolved, idx) => (
                              <div key={`main-resolved-${idx}`} className={`flex items-center gap-2 px-2 py-1 rounded border text-sm ${isFileExpired ? 'bg-red-50 border-red-300 dark:bg-red-950/20 dark:border-red-800' : 'bg-transparent'}`}>
                                <FileText className={`h-4 w-4 shrink-0 ${isFileExpired ? 'text-red-500' : 'text-muted-foreground'}`} />
                                <span 
                                  className={`max-w-[150px] truncate ${isFileExpired ? 'cursor-not-allowed text-red-600 dark:text-red-400 line-through' : 'cursor-pointer hover:underline'}`}
                                  title={resolved.fileName}
                                  onClick={async (e) => {
                                      e.preventDefault()
                                      if (isFileExpired) {
                                        alert('다운로드 기간이 지나 다운로드할 수 없습니다.')
                                        return
                                      }
                                      try {
                                        const response = await fetch(`/api/storage/signed-url?path=${encodeURIComponent(resolved.s3Key)}&expiresIn=604800`, {
                                          credentials: 'include',
                                        })
                                        if (!response.ok) {
                                          const errorData = await response.json().catch(() => ({}))
                                          const errorMessage = errorData.error || '다운로드 URL 생성 실패'
                                          if (errorMessage.includes('존재하지 않') || errorMessage.includes('기간이 지났') || response.status === 404) {
                                            throw new Error('파일이 존재하지 않거나 다운로드 기간이 지났습니다.')
                                          }
                                          throw new Error(errorMessage)
                                        }
                                        const data = await response.json()
                                        if (data.signedUrl) {
                                          const a = document.createElement('a')
                                          a.href = data.signedUrl
                                          a.download = resolved.fileName
                                          document.body.appendChild(a)
                                          a.click()
                                          document.body.removeChild(a)
                                        } else {
                                          throw new Error('서명된 URL을 받을 수 없습니다')
                                        }
                                      } catch (error: any) {
                                        console.error('파일 다운로드 오류:', error)
                                        toast({
                                          title: '오류',
                                          description: error.message || '파일 다운로드에 실패했습니다.',
                                          variant: 'destructive',
                                        })
                                      }
                                    }}
                                  >
                                    {resolved.fileName}
                                  </span>
                                  <span className={`text-xs ${isFileExpired ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted-foreground'}`}>
                                    ({fileExpiry.expiryText})
                                  </span>
                              </div>
                            ))}
                          </div>
                        </div>
                        );
                      })()}
                    </div>
                    
                    {/* 내용 에디터 (아래로 이동) */}
                    <div className="space-y-2 min-w-0 max-w-full">
                      <Label htmlFor="work-comment-content" className="text-base font-semibold">내용</Label>
                    <div className="border rounded-md overflow-hidden bg-background" style={{
                      height: '350px',
                      minHeight: '350px',
                      maxHeight: '350px',
                      display: 'flex',
                      flexDirection: 'column'
                    }}>
                      <div className="flex items-center gap-1 p-2 flex-wrap shrink-0">
                        <Button
                          type="button"
                          variant={workCommentEditorState.bold ? "secondary" : "ghost"}
                          size="sm"
                          className={`h-8 w-8 p-0 ${workCommentEditorState.bold ? 'bg-primary/10' : ''}`}
                          onClick={(e) => {
                            e.preventDefault()
                            if (!workTaskId) return
                            const editor = document.getElementById('work-comment-content')
                            if (editor) {
                              editor.focus()
                              document.execCommand('bold', false)
                              updateCommentEditorState()
                            }
                          }}
                          title="굵게 (Ctrl+B)"
                          disabled={!workTaskId}
                        >
                          <Bold className={`h-4 w-4 ${workCommentEditorState.bold ? 'text-primary' : ''}`} />
                        </Button>
                        <Button
                          type="button"
                          variant={workCommentEditorState.italic ? "secondary" : "ghost"}
                          size="sm"
                          className={`h-8 w-8 p-0 ${workCommentEditorState.italic ? 'bg-primary/10' : ''}`}
                          onClick={(e) => {
                            e.preventDefault()
                            if (!workTaskId) return
                            const editor = document.getElementById('work-comment-content')
                            if (editor) {
                              editor.focus()
                              document.execCommand('italic', false)
                              updateCommentEditorState()
                            }
                          }}
                          title="기울임 (Ctrl+I)"
                          disabled={!workTaskId}
                        >
                          <Italic className={`h-4 w-4 ${workCommentEditorState.italic ? 'text-primary' : ''}`} />
                        </Button>
                        <Button
                          type="button"
                          variant={workCommentEditorState.underline ? "secondary" : "ghost"}
                          size="sm"
                          className={`h-8 w-8 p-0 ${workCommentEditorState.underline ? 'bg-primary/10' : ''}`}
                          onClick={(e) => {
                            e.preventDefault()
                            if (!workTaskId) return
                            const editor = document.getElementById('work-comment-content')
                            if (editor) {
                              editor.focus()
                              document.execCommand('underline', false)
                              updateCommentEditorState()
                            }
                          }}
                          title="밑줄"
                          disabled={!workTaskId}
                        >
                          <Underline className={`h-4 w-4 ${workCommentEditorState.underline ? 'text-primary' : ''}`} />
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
                              if (!workTaskId) return
                              if (workCommentTableGridHover.show) {
                                setWorkCommentTableGridHover({ row: 0, col: 0, show: false })
                              } else {
                                setWorkCommentTableGridHover({ row: 0, col: 0, show: true })
                              }
                            }}
                            title="테이블"
                            disabled={!workTaskId}
                          >
                            <TableIcon className="h-4 w-4" />
                          </Button>
                          {workCommentTableGridHover.show && workTaskId && (
                            <div 
                              className="absolute top-full left-0 mt-2 bg-background border rounded-lg shadow-xl p-4 z-50 min-w-[280px]"
                              onMouseLeave={() => setWorkCommentTableGridHover({ row: 0, col: 0, show: false })}
                            >
                              <div className="grid grid-cols-10 gap-1 mb-3">
                                {Array.from({ length: 100 }).map((_, idx) => {
                                  const row = Math.floor(idx / 10) + 1
                                  const col = (idx % 10) + 1
                                  const isSelected = row <= workCommentTableGridHover.row && col <= workCommentTableGridHover.col
                                  
                                  return (
                                    <div
                                      key={idx}
                                      className={`w-5 h-5 border border-border rounded-sm transition-colors ${
                                        isSelected ? 'bg-primary border-primary' : 'bg-muted hover:bg-muted/80'
                                      }`}
                                      onMouseEnter={() => {
                                        setWorkCommentTableGridHover({ row, col, show: true })
                                      }}
                                      onClick={() => {
                                        if (!workTaskId) return
                                        createCommentTable(row, col)
                                        setWorkCommentTableGridHover({ row: 0, col: 0, show: false })
                                      }}
                                    />
                                  )
                                })}
                              </div>
                              <div className="text-sm text-center font-medium text-foreground border-t pt-2">
                                {workCommentTableGridHover.row > 0 && workCommentTableGridHover.col > 0 
                                  ? `${workCommentTableGridHover.row} x ${workCommentTableGridHover.col} 테이블`
                                  : '테이블 크기 선택'}
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
                            if (!workTaskId) return
                            const editor = document.getElementById('work-comment-content')
                            if (editor) {
                              editor.focus()
                              const hr = document.createElement('hr')
                              hr.style.border = 'none'
                              hr.style.borderTop = '2px solid #6b7280'
                              hr.style.margin = '10px 0'
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
                              const html = editor.innerHTML
                              setWorkCommentContent(html)
                            }
                          }}
                          title="구분선"
                          disabled={!workTaskId}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                      </div>
                      <div
                        id="work-comment-content"
                        contentEditable={!!workTaskId}
                        suppressContentEditableWarning
                        onInput={(e) => {
                          if (!workTaskId) return
                          const html = e.currentTarget.innerHTML
                          setWorkCommentContent(html)
                          updateCommentEditorState()
                          setTimeout(() => {
                            const editor = document.getElementById('work-comment-content')
                            if (editor) {
                              const tables = editor.querySelectorAll('table[data-resizable="true"]')
                              tables.forEach((table) => {
                                addResizeHandlersToCommentTable(table as HTMLTableElement)
                              })
                            }
                          }, 0)
                        }}
                        onBlur={(e) => {
                          if (!workTaskId) return
                          const html = e.currentTarget.innerHTML
                          setWorkCommentContent(html)
                          updateCommentEditorState()
                        }}
                        onMouseUp={updateCommentEditorState}
                        onKeyUp={updateCommentEditorState}
                        className={`resize-none text-base leading-relaxed w-full max-w-full min-w-0 overflow-y-auto border-t p-3 focus:outline-none focus:ring-0 bg-background flex-1 ${!workTaskId ? 'opacity-50' : ''}`}
                        style={{ 
                          minHeight: '300px',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word'
                        }}
                        data-placeholder="내용을 입력하세요."
                      />
                      <style jsx global>{`
                        #work-comment-content:empty:before {
                          content: attr(data-placeholder);
                          color: #9ca3af;
                          pointer-events: none;
                        }
                        #work-comment-content[contenteditable="false"]:empty:before {
                          content: "작업을 선택해주세요.";
                          color: #9ca3af;
                          pointer-events: none;
                        }
                        #work-comment-content table {
                          border-collapse: collapse;
                          width: 100%;
                          margin: 10px 0;
                          border: 2px solid #6b7280;
                        }
                        #work-comment-content table td,
                        #work-comment-content table th {
                          border: 2px solid #6b7280;
                          padding: 8px;
                          position: relative;
                        }
                        #work-comment-content table td u,
                        #work-comment-content table th u,
                        #work-comment-content table td[style*="underline"],
                        #work-comment-content table th[style*="underline"],
                        #work-comment-content table td *[style*="underline"],
                        #work-comment-content table th *[style*="underline"] {
                          text-decoration: none !important;
                        }
                        #work-comment-content table td * u,
                        #work-comment-content table th * u {
                          text-decoration: none !important;
                        }
                        #work-comment-content hr {
                          border: none;
                          border-top: 2px solid #9ca3af;
                          margin: 10px 0;
                        }
                        #work-content-readonly table {
                          border-collapse: collapse;
                          width: 100%;
                          margin: 10px 0;
                          border: 2px solid #6b7280;
                        }
                        #work-content-readonly table td,
                        #work-content-readonly table th {
                          border: 2px solid #6b7280;
                          padding: 8px;
                          cursor: default !important;
                          pointer-events: none;
                          user-select: none;
                        }
                        #work-content-readonly hr {
                          border: none;
                          border-top: 2px solid #9ca3af;
                          margin: 10px 0;
                        }
                        /* 모든 contentEditable 테이블 셀의 언더라인 제거 */
                        table[data-resizable="true"] td[contenteditable="true"] u,
                        table[data-resizable="true"] th[contenteditable="true"] u,
                        table[data-resizable="true"] td[contenteditable="true"][style*="underline"],
                        table[data-resizable="true"] th[contenteditable="true"][style*="underline"],
                        table[data-resizable="true"] td[contenteditable="true"] *[style*="underline"],
                        table[data-resizable="true"] th[contenteditable="true"] *[style*="underline"],
                        table[data-resizable="true"] td[contenteditable="true"] * u,
                        table[data-resizable="true"] th[contenteditable="true"] * u {
                          text-decoration: none !important;
                        }
                      `}</style>
                    </div>
                  </div>
                
                {/* 첨부파일 */}
                <div className="space-y-2 min-w-0 max-w-full mt-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-semibold">작성 내용 첨부파일</Label>
                          <div className="flex items-center gap-2">
                            {(workCommentFiles.length > 0 || workCommentResolvedFileKeys.length > 0) && (
                              <div className="text-sm text-muted-foreground">
                                {workCommentFiles.length + workCommentResolvedFileKeys.length}개 파일
                              </div>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (!workTaskId) return
                                // 파일 선택 전에 작성 중인 내용을 state에 반영 (리렌더 시 유지)
                                const commentEl = document.getElementById("work-comment-content")
                                if (commentEl?.innerHTML != null) setWorkCommentContent(commentEl.innerHTML)
                                const workEl = document.getElementById("work-content")
                                if (workEl?.innerHTML != null) setWorkForm((prev) => ({ ...prev, content: workEl.innerHTML }))
                                const input = document.createElement('input')
                                input.type = 'file'
                                input.multiple = true
                                input.onchange = (e) => {
                                  const files = (e.target as HTMLInputElement).files
                                  if (files && files.length > 0) {
                                    const maxSize = 500 * 1024 * 1024 // 500MB
                                    const fileArray = Array.from(files)
                                    const validFiles: File[] = []
                                    
                                    for (const file of fileArray) {
                                      if (file.size > maxSize) {
                                        toast({
                                          title: '파일 크기 초과',
                                          description: `${file.name} 파일이 500MB를 초과합니다.`,
                                          variant: 'destructive',
                                        })
                                        continue
                                      }
                                      validFiles.push(file)
                                    }
                                    
                                    if (validFiles.length > 0) {
                                      setWorkCommentFiles(prev => [...prev, ...validFiles])
                                    }
                                  }
                                }
                                input.click()
                              }}
                              disabled={!workTaskId || isUploadingWork}
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              파일 첨부
                            </Button>
                          </div>
                        </div>
                    {(workCommentFiles.length > 0 || workCommentResolvedFileKeys.length > 0) ? (
                      <div className="flex flex-wrap gap-2 p-2 border border-transparent rounded-md bg-transparent mb-2">
                        {/* 기존 저장된 첨부파일 (workCommentResolvedFileKeys) - 전체 표시 */}
                        {workCommentResolvedFileKeys.map((resolved, idx) => {
                          const fileExpiry = calculateFileExpiry(resolved.uploadedAt ?? null)
                          const isExpired = fileExpiry.isExpired
                          const expiryDateStr = !isExpired ? formatDateShort(fileExpiry.expiresAt) : null
                          
                          return (
                          <div key={`comment-resolved-${idx}`} className={`flex items-center gap-2 px-2 py-1 rounded border text-sm ${isExpired ? 'bg-red-50 border-red-300 dark:bg-red-950/20 dark:border-red-800' : 'bg-transparent'}`}>
                            <FileText className={`h-4 w-4 shrink-0 ${isExpired ? 'text-red-500' : 'text-muted-foreground'}`} />
                            <span 
                              className={`max-w-[150px] truncate ${isExpired ? 'cursor-not-allowed text-red-600 dark:text-red-400 line-through' : 'cursor-pointer hover:underline'}`}
                              title={`${resolved.fileName}${expiryDateStr ? ` ~ ${expiryDateStr}` : ''}`}
                              onClick={async (e) => {
                                  e.preventDefault()
                                  
                                  // 7일이 지났으면 다운로드 불가
                                  if (isExpired) {
                                    alert(`다운로드 기간 만료\n\n이 파일의 다운로드 기간이 지나 다운로드할 수 없습니다.`)
                                    return
                                  }
                                  
                                  try {
                                    const response = await fetch(`/api/storage/signed-url?path=${encodeURIComponent(resolved.s3Key)}&expiresIn=604800`, {
                                      credentials: 'include',
                                    })
                                    if (!response.ok) {
                                      const errorData = await response.json().catch(() => ({}))
                                      const errorMessage = errorData.error || '다운로드 URL 생성 실패'
                                      // NoSuchKey 에러 메시지 확인
                                      if (errorMessage.includes('존재하지 않') || errorMessage.includes('기간이 지났') || response.status === 404) {
                                        throw new Error('파일이 존재하지 않거나 다운로드 기간이 지났습니다.')
                                      }
                                      throw new Error(errorMessage)
                                    }
                                    const data = await response.json()
                                    if (data.signedUrl) {
                                      const a = document.createElement('a')
                                      a.href = data.signedUrl
                                      a.download = resolved.fileName
                                      document.body.appendChild(a)
                                      a.click()
                                      document.body.removeChild(a)
                                    } else {
                                      throw new Error('서명된 URL을 받을 수 없습니다')
                                    }
                                  } catch (error: any) {
                                    console.error('파일 다운로드 오류:', error)
                                    toast({
                                      title: '오류',
                                      description: error.message || '파일 다운로드에 실패했습니다. 파일이 존재하지 않거나 다운로드 기간이 지났습니다.',
                                      variant: 'destructive',
                                    })
                                  }
                                }}
                            >
                              {resolved.fileName}
                            </span>
                            <span className={`text-xs shrink-0 ${isExpired ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted-foreground'}`}>
                              ({fileExpiry.expiryText})
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => {
                                if (!workTaskId) return
                                setWorkCommentResolvedFileKeys(workCommentResolvedFileKeys.filter((_, i) => i !== idx))
                              }}
                              disabled={!workTaskId}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                          )
                        })}
                            {/* 새로 업로드한 첨부파일 (workCommentFiles) - 전체 표시 */}
                            {workCommentFiles.map((file, idx) => (
                              <div key={`comment-${idx}`} className="flex items-center gap-2 px-2 py-1 bg-transparent rounded border text-sm">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                <span className="max-w-[150px] truncate" title={`${(file.size / 1024 / 1024).toFixed(2)}MB`}>
                                  {file.name}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={() => {
                                    if (!workTaskId) return
                                    setWorkCommentFiles(workCommentFiles.filter((_, i) => i !== idx))
                                  }}
                                  disabled={!workTaskId}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>* 파일 크기 제한: 각 파일당 최대 500MB</div>
                      </div>
                    </div>
                    </>
                  )})()}
                  
                  {/* 공동 탭 - 편집 가능한 에디터 */}
                  {(() => {
                    const currentTask = workTaskId ? tasks.find(t => t.id === workTaskId) : null
                    const isMultiAssign = currentTask?.is_multi_assign
                    
                    // is_multi_assign이 true이거나, undefined일 때 contentMode가 'add'인 경우 공동 탭 표시
                    const showMulti = (isMultiAssign === true) || (isMultiAssign === undefined && contentMode === 'add')
                    
                    return showMulti && (
                    <>
                    {/* 본문 (위에 배치, full width) */}
                    <div className="space-y-2 min-w-0 max-w-full mb-4">
                      <Label className="text-base font-semibold">본문</Label>
                      {isWorkAreaReadOnly && workForm.content ? (
                        <div className="border rounded-md overflow-hidden bg-muted/30" style={{
                          height: '280px',
                          minHeight: '280px',
                          maxHeight: '280px',
                          display: 'flex',
                          flexDirection: 'column'
                        }}>
                          <div
                            id="work-content-readonly-add"
                            className="text-sm bg-muted/50 p-3 wrap-break-word word-break break-all overflow-x-auto prose prose-sm max-w-none flex-1"
                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(workForm.content) }}
                            style={{
                              minHeight: '250px',
                              overflowY: 'auto',
                              userSelect: 'none',
                              cursor: 'default',
                              opacity: 0.7,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word'
                            }}
                            ref={(el) => {
                              if (el) {
                                const tables = el.querySelectorAll('table')
                                tables.forEach((table) => {
                                  const cells = table.querySelectorAll('td, th')
                                  cells.forEach((cell) => {
                                    (cell as HTMLElement).contentEditable = 'false'
                                  })
                                })
                              }
                            }}
                          />
                        </div>
                      ) : (
                        <div className="border rounded-md bg-muted/30 p-4 text-center text-muted-foreground" style={{
                          height: '280px',
                          minHeight: '280px',
                          maxHeight: '280px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          본문이 없습니다
                        </div>
                      )}
                      
                      {/* 요청자 첨부파일 표시 - 다운로드 기간은 요청일(작업 생성일) 기준 7일 */}
                      {workResolvedFileKeys.length > 0 && (() => {
                        const workTask = workTaskId ? tasks.find(t => t.id === workTaskId) : null
                        const requestDate = workTask?.created_at ?? null
                        const fileExpiry = calculateFileExpiry(requestDate)
                        const isFileExpired = fileExpiry.isExpired
                        return (
                        <div className="space-y-2 mt-2">
                          <Label className="text-sm font-semibold">요청자 첨부파일</Label>
                          <div className="flex flex-wrap gap-2 p-2 border border-transparent rounded-md bg-transparent">
                            {workResolvedFileKeys.map((resolved, idx) => (
                              <div key={`multi-resolved-${idx}`} className={`flex items-center gap-2 px-2 py-1 rounded border text-sm ${isFileExpired ? 'bg-red-50 border-red-300 dark:bg-red-950/20 dark:border-red-800' : 'bg-transparent'}`}>
                                <FileText className={`h-4 w-4 shrink-0 ${isFileExpired ? 'text-red-500' : 'text-muted-foreground'}`} />
                                <span 
                                  className={`max-w-[150px] truncate ${isFileExpired ? 'cursor-not-allowed text-red-600 dark:text-red-400 line-through' : 'cursor-pointer hover:underline'}`}
                                  title={resolved.fileName}
                                  onClick={async (e) => {
                                    e.preventDefault()
                                    if (isFileExpired) {
                                      alert('다운로드 기간이 지나 다운로드할 수 없습니다.')
                                      return
                                    }
                                    try {
                                      const response = await fetch(`/api/storage/signed-url?path=${encodeURIComponent(resolved.s3Key)}&expiresIn=604800`, {
                                        credentials: 'include',
                                      })
                                      if (!response.ok) {
                                        const errorData = await response.json().catch(() => ({}))
                                        const errorMessage = errorData.error || '다운로드 URL 생성 실패'
                                        if (errorMessage.includes('존재하지 않') || errorMessage.includes('기간이 지났') || response.status === 404) {
                                          throw new Error('파일이 존재하지 않거나 다운로드 기간이 지났습니다.')
                                        }
                                        throw new Error(errorMessage)
                                      }
                                      const data = await response.json()
                                      if (data.signedUrl) {
                                        const a = document.createElement('a')
                                        a.href = data.signedUrl
                                        a.download = resolved.fileName
                                        document.body.appendChild(a)
                                        a.click()
                                        document.body.removeChild(a)
                                      } else {
                                        throw new Error('서명된 URL을 받을 수 없습니다')
                                      }
                                    } catch (error: any) {
                                      console.error('파일 다운로드 오류:', error)
                                      toast({
                                        title: '오류',
                                        description: error.message || '파일 다운로드에 실패했습니다.',
                                        variant: 'destructive',
                                      })
                                    }
                                  }}
                                >
                                  {resolved.fileName}
                                </span>
                                <span className={`text-xs shrink-0 ${isFileExpired ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted-foreground'}`}>
                                  ({fileExpiry.expiryText})
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                        );
                      })()}
                    </div>
                    
                    {/* 내용 에디터 (아래로 이동) */}
                    <div className="space-y-2 min-w-0 max-w-full">
                      <Label htmlFor="work-comment-content" className="text-base font-semibold">내용</Label>
                    <div className="border rounded-md overflow-hidden bg-background" style={{
                      height: '350px',
                      minHeight: '350px',
                      maxHeight: '350px',
                      display: 'flex',
                      flexDirection: 'column'
                    }}>
                      <div className="flex items-center gap-1 p-2 flex-wrap shrink-0">
                        <Button
                          type="button"
                          variant={workCommentEditorState.bold ? "secondary" : "ghost"}
                          size="sm"
                          className={`h-8 w-8 p-0 ${workCommentEditorState.bold ? 'bg-primary/10' : ''}`}
                          onClick={(e) => {
                            e.preventDefault()
                            if (!workTaskId) return
                            const editor = document.getElementById('work-comment-content')
                            if (editor) {
                              editor.focus()
                              document.execCommand('bold', false)
                              updateCommentEditorState()
                            }
                          }}
                          title="굵게 (Ctrl+B)"
                          disabled={!workTaskId}
                        >
                          <Bold className={`h-4 w-4 ${workCommentEditorState.bold ? 'text-primary' : ''}`} />
                        </Button>
                        <Button
                          type="button"
                          variant={workCommentEditorState.italic ? "secondary" : "ghost"}
                          size="sm"
                          className={`h-8 w-8 p-0 ${workCommentEditorState.italic ? 'bg-primary/10' : ''}`}
                          onClick={(e) => {
                            e.preventDefault()
                            if (!workTaskId) return
                            const editor = document.getElementById('work-comment-content')
                            if (editor) {
                              editor.focus()
                              document.execCommand('italic', false)
                              updateCommentEditorState()
                            }
                          }}
                          title="기울임 (Ctrl+I)"
                          disabled={!workTaskId}
                        >
                          <Italic className={`h-4 w-4 ${workCommentEditorState.italic ? 'text-primary' : ''}`} />
                        </Button>
                        <Button
                          type="button"
                          variant={workCommentEditorState.underline ? "secondary" : "ghost"}
                          size="sm"
                          className={`h-8 w-8 p-0 ${workCommentEditorState.underline ? 'bg-primary/10' : ''}`}
                          onClick={(e) => {
                            e.preventDefault()
                            if (!workTaskId) return
                            const editor = document.getElementById('work-comment-content')
                            if (editor) {
                              editor.focus()
                              document.execCommand('underline', false)
                              updateCommentEditorState()
                            }
                          }}
                          title="밑줄"
                          disabled={!workTaskId}
                        >
                          <Underline className={`h-4 w-4 ${workCommentEditorState.underline ? 'text-primary' : ''}`} />
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
                              if (!workTaskId) return
                              if (workCommentTableGridHover.show) {
                                setWorkCommentTableGridHover({ row: 0, col: 0, show: false })
                              } else {
                                setWorkCommentTableGridHover({ row: 0, col: 0, show: true })
                              }
                            }}
                            title="테이블"
                            disabled={!workTaskId}
                          >
                            <TableIcon className="h-4 w-4" />
                          </Button>
                          {workCommentTableGridHover.show && workTaskId && (
                            <div 
                              className="absolute top-full left-0 mt-2 bg-background border rounded-lg shadow-xl p-4 z-50 min-w-[280px]"
                              onMouseLeave={() => setWorkCommentTableGridHover({ row: 0, col: 0, show: false })}
                            >
                              <div className="grid grid-cols-10 gap-1 mb-3">
                                {Array.from({ length: 100 }).map((_, idx) => {
                                  const row = Math.floor(idx / 10) + 1
                                  const col = (idx % 10) + 1
                                  const isSelected = row <= workCommentTableGridHover.row && col <= workCommentTableGridHover.col
                                  
                                  return (
                                    <div
                                      key={idx}
                                      className={`w-5 h-5 border border-border rounded-sm transition-colors ${
                                        isSelected ? 'bg-primary border-primary' : 'bg-muted hover:bg-muted/80'
                                      }`}
                                      onMouseEnter={() => {
                                        setWorkCommentTableGridHover({ row, col, show: true })
                                      }}
                                      onClick={() => {
                                        if (!workTaskId) return
                                        createCommentTable(row, col)
                                        setWorkCommentTableGridHover({ row: 0, col: 0, show: false })
                                      }}
                                    />
                                  )
                                })}
                              </div>
                              <div className="text-sm text-center font-medium text-foreground border-t pt-2">
                                {workCommentTableGridHover.row > 0 && workCommentTableGridHover.col > 0 
                                  ? `${workCommentTableGridHover.row} x ${workCommentTableGridHover.col} 테이블`
                                  : '테이블 크기 선택'}
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
                            if (!workTaskId) return
                            const editor = document.getElementById('work-comment-content')
                            if (editor) {
                              editor.focus()
                              const hr = document.createElement('hr')
                              hr.style.border = 'none'
                              hr.style.borderTop = '2px solid #6b7280'
                              hr.style.margin = '10px 0'
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
                              const html = editor.innerHTML
                              setWorkCommentContent(html)
                            }
                          }}
                          title="구분선"
                          disabled={!workTaskId}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                      </div>
                      <div
                        id="work-comment-content"
                        contentEditable={!!workTaskId}
                        suppressContentEditableWarning
                        onInput={(e) => {
                          if (!workTaskId) return
                          const html = e.currentTarget.innerHTML
                          setWorkCommentContent(html)
                          updateCommentEditorState()
                          setTimeout(() => {
                            const editor = document.getElementById('work-comment-content')
                            if (editor) {
                              const tables = editor.querySelectorAll('table[data-resizable="true"]')
                              tables.forEach((table) => {
                                addResizeHandlersToCommentTable(table as HTMLTableElement)
                              })
                            }
                          }, 0)
                        }}
                        onBlur={(e) => {
                          if (!workTaskId) return
                          const html = e.currentTarget.innerHTML
                          setWorkCommentContent(html)
                          updateCommentEditorState()
                        }}
                        onMouseUp={updateCommentEditorState}
                        onKeyUp={updateCommentEditorState}
                        className={`resize-none text-base leading-relaxed w-full max-w-full min-w-0 overflow-y-auto border-t p-3 focus:outline-none focus:ring-0 bg-background flex-1 ${!workTaskId ? 'opacity-50' : ''}`}
                        style={{ 
                          minHeight: '300px',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word'
                        }}
                        data-placeholder="내용을 입력하세요."
                      />
                      <style jsx global>{`
                        #work-comment-content:empty:before {
                          content: attr(data-placeholder);
                          color: #9ca3af;
                          pointer-events: none;
                        }
                        #work-comment-content[contenteditable="false"]:empty:before {
                          content: "작업을 선택해주세요.";
                          color: #9ca3af;
                          pointer-events: none;
                        }
                        #work-comment-content table {
                          border-collapse: collapse;
                          width: 100%;
                          margin: 10px 0;
                          border: 2px solid #6b7280;
                        }
                        #work-comment-content table td,
                        #work-comment-content table th {
                          border: 2px solid #6b7280;
                          padding: 8px;
                          position: relative;
                        }
                        #work-comment-content table td u,
                        #work-comment-content table th u,
                        #work-comment-content table td[style*="underline"],
                        #work-comment-content table th[style*="underline"],
                        #work-comment-content table td *[style*="underline"],
                        #work-comment-content table th *[style*="underline"] {
                          text-decoration: none !important;
                        }
                        #work-comment-content table td * u,
                        #work-comment-content table th * u {
                          text-decoration: none !important;
                        }
                        #work-comment-content hr {
                          border: none;
                          border-top: 2px solid #9ca3af;
                          margin: 10px 0;
                        }
                        #work-content-readonly table {
                          border-collapse: collapse;
                          width: 100%;
                          margin: 10px 0;
                          border: 2px solid #6b7280;
                        }
                        #work-content-readonly table td,
                        #work-content-readonly table th {
                          border: 2px solid #6b7280;
                          padding: 8px;
                          cursor: default !important;
                          pointer-events: none;
                          user-select: none;
                        }
                        #work-content-readonly hr {
                          border: none;
                          border-top: 2px solid #9ca3af;
                          margin: 10px 0;
                        }
                        /* 모든 contentEditable 테이블 셀의 언더라인 제거 */
                        table[data-resizable="true"] td[contenteditable="true"] u,
                        table[data-resizable="true"] th[contenteditable="true"] u,
                        table[data-resizable="true"] td[contenteditable="true"][style*="underline"],
                        table[data-resizable="true"] th[contenteditable="true"][style*="underline"],
                        table[data-resizable="true"] td[contenteditable="true"] *[style*="underline"],
                        table[data-resizable="true"] th[contenteditable="true"] *[style*="underline"],
                        table[data-resizable="true"] td[contenteditable="true"] * u,
                        table[data-resizable="true"] th[contenteditable="true"] * u {
                          text-decoration: none !important;
                        }
                      `}</style>
                    </div>
                  </div>
                
                {/* 첨부파일 */}
                <div className="space-y-2 min-w-0 max-w-full mt-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-semibold">작성 내용 첨부파일</Label>
                          <div className="flex items-center gap-2">
                            {(workCommentFiles.length > 0 || workCommentResolvedFileKeys.length > 0) && (
                              <div className="text-sm text-muted-foreground">
                                {workCommentFiles.length + workCommentResolvedFileKeys.length}개 파일
                              </div>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (!workTaskId) return
                                // 파일 선택 전에 작성 중인 내용을 state에 반영 (리렌더 시 유지)
                                const commentEl = document.getElementById("work-comment-content")
                                if (commentEl?.innerHTML != null) setWorkCommentContent(commentEl.innerHTML)
                                const workEl = document.getElementById("work-content")
                                if (workEl?.innerHTML != null) setWorkForm((prev) => ({ ...prev, content: workEl.innerHTML }))
                                const input = document.createElement('input')
                                input.type = 'file'
                                input.multiple = true
                                input.onchange = (e) => {
                                  const files = (e.target as HTMLInputElement).files
                                  if (files && files.length > 0) {
                                    const maxSize = 500 * 1024 * 1024 // 500MB
                                    const fileArray = Array.from(files)
                                    const validFiles: File[] = []
                                    
                                    for (const file of fileArray) {
                                      if (file.size > maxSize) {
                                        toast({
                                          title: '파일 크기 초과',
                                          description: `${file.name} 파일이 500MB를 초과합니다.`,
                                          variant: 'destructive',
                                        })
                                        continue
                                      }
                                      validFiles.push(file)
                                    }
                                    
                                    if (validFiles.length > 0) {
                                      setWorkCommentFiles(prev => [...prev, ...validFiles])
                                    }
                                  }
                                }
                                input.click()
                              }}
                              disabled={!workTaskId || isUploadingWork}
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              파일 첨부
                            </Button>
                          </div>
                        </div>
                    {(workCommentFiles.length > 0 || workCommentResolvedFileKeys.length > 0) ? (
                      <div className="flex flex-wrap gap-2 p-2 border border-transparent rounded-md bg-transparent mb-2">
                        {/* 기존 저장된 첨부파일 (workCommentResolvedFileKeys) - 전체 표시 */}
                        {workCommentResolvedFileKeys.map((resolved, idx) => {
                          const fileExpiry = calculateFileExpiry(resolved.uploadedAt ?? null)
                          const isExpired = fileExpiry.isExpired
                          const expiryDateStr = !isExpired ? formatDateShort(fileExpiry.expiresAt) : null
                          
                          return (
                          <div key={`comment-resolved-${idx}`} className={`flex items-center gap-2 px-2 py-1 rounded border text-sm ${isExpired ? 'bg-red-50 border-red-300 dark:bg-red-950/20 dark:border-red-800' : 'bg-transparent'}`}>
                            <FileText className={`h-4 w-4 shrink-0 ${isExpired ? 'text-red-500' : 'text-muted-foreground'}`} />
                            <span 
                              className={`max-w-[150px] truncate ${isExpired ? 'cursor-not-allowed text-red-600 dark:text-red-400 line-through' : 'cursor-pointer hover:underline'}`}
                              title={`${resolved.fileName}${expiryDateStr ? ` ~ ${expiryDateStr}` : ''}`}
                              onClick={async (e) => {
                                  e.preventDefault()
                                  
                                  // 7일이 지났으면 다운로드 불가
                                  if (isExpired) {
                                    alert(`다운로드 기간 만료\n\n이 파일의 다운로드 기간이 지나 다운로드할 수 없습니다.`)
                                    return
                                  }
                                  
                                  try {
                                    const response = await fetch(`/api/storage/signed-url?path=${encodeURIComponent(resolved.s3Key)}&expiresIn=604800`, {
                                      credentials: 'include',
                                    })
                                    if (!response.ok) {
                                      const errorData = await response.json().catch(() => ({}))
                                      const errorMessage = errorData.error || '다운로드 URL 생성 실패'
                                      // NoSuchKey 에러 메시지 확인
                                      if (errorMessage.includes('존재하지 않') || errorMessage.includes('기간이 지났') || response.status === 404) {
                                        throw new Error('파일이 존재하지 않거나 다운로드 기간이 지났습니다.')
                                      }
                                      throw new Error(errorMessage)
                                    }
                                    const data = await response.json()
                                    if (data.signedUrl) {
                                      const a = document.createElement('a')
                                      a.href = data.signedUrl
                                      a.download = resolved.fileName
                                      document.body.appendChild(a)
                                      a.click()
                                      document.body.removeChild(a)
                                    } else {
                                      throw new Error('서명된 URL을 받을 수 없습니다')
                                    }
                                  } catch (error: any) {
                                    console.error('파일 다운로드 오류:', error)
                                    toast({
                                      title: '오류',
                                      description: error.message || '파일 다운로드에 실패했습니다. 파일이 존재하지 않거나 다운로드 기간이 지났습니다.',
                                      variant: 'destructive',
                                    })
                                  }
                                }}
                            >
                              {resolved.fileName}
                            </span>
                            <span className={`text-xs shrink-0 ${isExpired ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted-foreground'}`}>
                              ({fileExpiry.expiryText})
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => {
                                if (!workTaskId) return
                                setWorkCommentResolvedFileKeys(workCommentResolvedFileKeys.filter((_, i) => i !== idx))
                              }}
                              disabled={!workTaskId}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                          )
                        })}
                            {/* 새로 업로드한 첨부파일 (workCommentFiles) - 전체 표시 */}
                            {workCommentFiles.map((file, idx) => (
                              <div key={`comment-${idx}`} className="flex items-center gap-2 px-2 py-1 bg-transparent rounded border text-sm">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                <span className="max-w-[150px] truncate" title={`${(file.size / 1024 / 1024).toFixed(2)}MB`}>
                                  {file.name}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={() => {
                                    if (!workTaskId) return
                                    setWorkCommentFiles(workCommentFiles.filter((_, i) => i !== idx))
                                  }}
                                  disabled={!workTaskId}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>* 파일 크기 제한: 각 파일당 최대 500MB</div>
                      </div>
                    </div>
                    </>
                  )})()}
                </div>
              {workTaskId && (
                <div className="flex justify-end gap-2 pt-4 border-t">
                  {isUploadingWork && (
                    <div className="w-[260px] self-center">
                      <Progress value={workUploadProgress} />
                    </div>
                  )}
                  <Button
                    type="button"
                    onClick={async () => {
                      if (!workTaskId || isUploadingWork) return
                      
                      setIsUploadingWork(true)
                      setWorkUploadProgress(0)
                      try {
                        // 댓글 첨부파일 업로드 (여러 개)
                        let fileKeys: string[] = []
                        if (workCommentFiles.length > 0) {
                          for (let i = 0; i < workCommentFiles.length; i++) {
                            const file = workCommentFiles[i]
                            const formData = new FormData()
                            formData.append("file", file)
                            formData.append("fileType", "other")
                            // Progress에서 첨부파일은 temp/attachment/{userId}/ 경로에 저장
                            // path에 userId를 포함시키지 않고, API에서 토큰의 userId를 사용하도록 함
                            formData.append("path", `temp/attachment/${file.name}`)
                            
                            const uploadData = await uploadWithProgress<{ path?: string }>({
                              url: "/api/storage/upload",
                              formData,
                              withCredentials: true,
                              onProgress: (p) => {
                                const overallProgress = ((i + p.percent / 100) / workCommentFiles.length) * 100
                                setWorkUploadProgress(Math.round(overallProgress))
                              },
                            })
                            if (uploadData?.path) fileKeys.push(uploadData.path)
                          }
                        }
                        
                        // 댓글 내용 가져오기
                        const commentEditor = document.getElementById('work-comment-content')
                        const commentEditorEl = document.getElementById('work-comment-content')
                        const commentContent = commentEditorEl ? commentEditorEl.innerHTML : workCommentContent
                        
                        // file_keys(관리자/업무 본문 첨부)는 기본적으로 기존 값 유지
                        // 과거 버그/교체 과정에서 client 첨부가 file_keys에 섞여 들어간 경우가 있어,
                        // comment_file_keys에 해당하는 키는 file_keys에서 제거하여 "중복 표시"를 방지
                        const existingCommentFileKeys = workCommentResolvedFileKeys.map(r => r.originalKey)
                        const existingFileKeys = workResolvedFileKeys
                          .map(r => r.originalKey)
                          .filter((k) => !existingCommentFileKeys.includes(k))
                        
                        // comment 첨부파일 키:
                        // - 새 파일 업로드가 있으면 기존 키에 추가
                        // - 새 업로드가 없으면 현재 선택(남아있는) 키만 저장
                        const commentFileKeys = [...existingCommentFileKeys, ...fileKeys]
                        
                        // Task 업데이트
                        // subtask인 경우: content 필드를 업데이트 (comment는 무시)
                        // main task인 경우: comment와 comment_file_keys를 업데이트
                        let updateBody: any = {}
                        if (workTaskIsSubtask) {
                          updateBody = {
                            content: commentContent || "",
                            comment_file_keys: commentFileKeys,
                          }
                        } else {
                          updateBody = {
                            content: workForm.content || "",
                            file_keys: existingFileKeys,
                            comment: commentContent || "",
                            comment_file_keys: commentFileKeys,
                          }
                        }
                        
                        const updateResponse = await fetch(`/api/tasks/${workTaskId}`, {
                          method: 'PATCH',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          credentials: 'include',
                          body: JSON.stringify(updateBody),
                        })

                        if (!updateResponse.ok) {
                          const errorData = await updateResponse.json().catch(() => ({}))
                          throw new Error(errorData.error || 'Task 업데이트 실패')
                        }

                        // 마감일 변경이 있으면 해당 업무(또는 부모)에 PATCH
                        if (workDueDatePickerValue !== undefined) {
                          const currentTask = tasks.find((t) => t.id === workTaskId)
                          const dueDatePatchId = currentTask?.is_subtask && currentTask?.task_id
                            ? currentTask.task_id
                            : workTaskId
                          const dueDateValue =
                            workDueDatePickerValue === null
                              ? null
                              : format(workDueDatePickerValue, 'yyyy-MM-dd')
                          const dueDateRes = await fetch(`/api/tasks/${dueDatePatchId}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ due_date: dueDateValue }),
                          })
                          if (!dueDateRes.ok) {
                            const errBody = await dueDateRes.json().catch(() => ({}))
                            throw new Error(
                              typeof errBody?.error === 'string' ? errBody.error : '마감일 업데이트 실패'
                            )
                          }
                          setWorkDueDatePickerValue(undefined)
                        }

                        // 임시저장 데이터 삭제
                        safeStorage.removeItem(`work-comment-temp-${workTaskId}`)
                        
                        toast({
                          title: "성공",
                          description: "댓글이 저장되었습니다.",
                        })
                        
                        // 저장된 댓글 내용 유지용 (loadTasks 리렌더 이후 DOM 복원에 사용)
                        const savedCommentContent = commentContent ?? ""
                        setWorkCommentContent(savedCommentContent)
                        setWorkCommentFiles([])
                        
                        // 새로 업로드한 파일을 workCommentResolvedFileKeys에 추가 (현재 시간을 uploadedAt으로 설정)
                        if (fileKeys.length > 0) {
                          const now = new Date().toISOString()
                          const newResolvedKeys = fileKeys.map((key, idx) => {
                            const fileName = workCommentFiles[idx]?.name || 
                              (typeof key === 'string' ? key.split('/').pop() : null) || 
                              '파일'
                            return {
                              originalKey: key,
                              s3Key: key,
                              fileName,
                              uploadedAt: now,
                            }
                          })
                          setWorkCommentResolvedFileKeys([...workCommentResolvedFileKeys, ...newResolvedKeys])
                        }
                        
                        // 작업 목록 새로고침 후, 리렌더가 끝난 다음에 '내용' DOM에 저장된 댓글 다시 넣기
                        await loadTasks()
                        setTimeout(() => {
                          const commentEditorEl = document.getElementById('work-comment-content')
                          if (commentEditorEl) {
                            commentEditorEl.innerHTML = savedCommentContent
                          }
                        }, 0)
                      } catch (error) {
                        console.error("댓글 저장 오류:", error)
                        toast({
                          title: "오류",
                          description: error instanceof Error ? error.message : "댓글 저장에 실패했습니다.",
                          variant: "destructive",
                        })
                      } finally {
                        setIsUploadingWork(false)
                        setWorkUploadProgress(0)
                      }
                    }}
                    disabled={isUploadingWork || !workTaskId}
                  >
                    {isUploadingWork ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        저장 중...
                      </>
                    ) : (
                      "저장"
                    )}
                  </Button>
                </div>
              )}
                  <TaskCommentSection
                    taskId={workTaskId}
                    me={user ? { id: user.id, role: userRole ?? user.role } : null}
                    allowWrite={true}
                    allowDelete={true}
                  />
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Task 상세 정보 Dialog - progress와 동일한 UI/기능 */}
      <TaskDetailDialog
        task={selectedTask}
        open={!!selectedTask}
        onOpenChange={(open) => {
          if (!open) setSelectedTask(null)
        }}
        onTaskUpdate={() => {
          loadTasks()
          setSelectedTask(null)
        }}
        finalizedTaskIds={finalizedTaskIds}
        setFinalizedTaskIds={setFinalizedTaskIds}
        userRole={userRole ?? user?.role}
        showDeleteTaskButton={!selectedTask || user?.id !== selectedTask.assigned_to}
        showCompleteButton={!selectedTask || user?.id !== selectedTask.assigned_to}
        showDueDateEditor={false}
        onEditTask={async (task) => {
          let mainTaskContent = task.content || ""
          let mainTaskFileKeys: string[] = (normalizeFileKeys(task.file_keys) ?? []) as string[]

          if (task.is_subtask && (task as Task).task_id) {
            try {
              const mainTaskRes = await fetch(`/api/tasks/${(task as Task).task_id}`, { credentials: "include" })
              if (mainTaskRes.ok) {
                const mainTaskData = await mainTaskRes.json()
                mainTaskContent = mainTaskData.task?.content || ""
                mainTaskFileKeys = (normalizeFileKeys(mainTaskData.task?.file_keys) ?? []) as string[]
              }
            } catch (error) {
              console.error("main task 로드 오류:", error)
            }
          }

          setWorkForm({
            title: task.title || "",
            content: mainTaskContent,
            priority: task.priority || "medium",
          })
          setWorkTaskId(task.id)
          setWorkTaskIsSubtask(task.is_subtask || false)
          setIsWorkAreaReadOnly(true)

          if (mainTaskFileKeys.length > 0) {
            fetch("/api/storage/resolve-file-keys", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ fileKeys: mainTaskFileKeys }),
            })
              .then((r) => r.json())
              .then((data) => setWorkResolvedFileKeys(data.resolvedKeys || []))
              .catch(() => setWorkResolvedFileKeys([]))
          } else {
            setWorkResolvedFileKeys([])
          }

          if (task.comment_file_keys?.length) {
            fetch("/api/storage/resolve-file-keys", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ fileKeys: task.comment_file_keys }),
            })
              .then((r) => r.json())
              .then((data) => setWorkCommentResolvedFileKeys(data.resolvedKeys || []))
              .catch(() => setWorkCommentResolvedFileKeys([]))
          } else {
            setWorkCommentResolvedFileKeys([])
          }

          setTimeout(() => {
            const editor = document.getElementById("work-content")
            if (editor && mainTaskContent) editor.innerHTML = mainTaskContent
            const commentEditorEl = document.getElementById("work-comment-content")
            if (commentEditorEl) {
              let contentToShow = ""
              if (task.is_subtask) {
                contentToShow = task.content || ""
              } else {
                const commentText = (task.comment ?? "").toString()
                contentToShow = commentText.startsWith("\n") ? commentText.substring(1) : commentText
              }
              commentEditorEl.innerHTML = contentToShow
              setWorkCommentContent(contentToShow)
            }
          }, 0)
          setSelectedTask(null)
        }}
      />
    </div>
  )
}

// Components imported from separate files
