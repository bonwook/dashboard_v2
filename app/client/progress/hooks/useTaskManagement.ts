import { useCallback, useMemo } from 'react'
import { Task, TaskStatus, WorkForm, ResolvedFileKey } from '../types'

interface UseTaskManagementProps {
  tasks: Task[]
  toast: any
  workTaskId: string | null
  setWorkTaskId: React.Dispatch<React.SetStateAction<string | null>>
  setWorkForm: React.Dispatch<React.SetStateAction<WorkForm>>
  setWorkResolvedFileKeys: React.Dispatch<React.SetStateAction<ResolvedFileKey[]>>
  setWorkCommentContent: React.Dispatch<React.SetStateAction<string>>
  setWorkCommentResolvedFileKeys: React.Dispatch<React.SetStateAction<ResolvedFileKey[]>>
  setIsWorkAreaReadOnly: React.Dispatch<React.SetStateAction<boolean>>
  setUpdatingTaskId: React.Dispatch<React.SetStateAction<string | null>>
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>
  clearWorkArea: (taskId?: string) => void
}

export function useTaskManagement(props: UseTaskManagementProps) {
  const {
    tasks,
    toast,
    workTaskId,
    setWorkTaskId,
    setWorkForm,
    setWorkResolvedFileKeys,
    setWorkCommentContent,
    setWorkCommentResolvedFileKeys,
    setIsWorkAreaReadOnly,
    setUpdatingTaskId,
    setTasks,
    setIsLoading,
    clearWorkArea,
  } = props

  const loadTasks = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/tasks", {
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Task 목록을 불러오는데 실패했습니다")
      }

      const data = await response.json()
      const loadedTasks: Task[] = Array.isArray(data.tasks) ? data.tasks : []
      setTasks(loadedTasks)
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
  }, [toast, setTasks, setIsLoading])

  const handleStatusChange = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    setUpdatingTaskId(taskId)
    try {
      const task = tasks.find(t => t.id === taskId)
      
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ 
          status: newStatus,
          is_subtask: task?.is_subtask || false
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "상태 업데이트 실패")
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
  }, [clearWorkArea, loadTasks, toast, workTaskId, tasks, setUpdatingTaskId])

  const handleWorkAreaDrop = useCallback(async (draggedTask: Task) => {
    setWorkForm({
      title: draggedTask.title || "",
      content: draggedTask.content || "",
      priority: draggedTask.priority || "medium",
    })
    setWorkTaskId(draggedTask.id)
    setIsWorkAreaReadOnly(true)

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

    setTimeout(() => {
      const editor = document.getElementById('work-content')
      if (editor && draggedTask.content) {
        editor.innerHTML = draggedTask.content
      }
      
      const commentEditor = document.getElementById('work-comment-content')
      if (commentEditor) {
        const commentText = (draggedTask.comment as string) || ""
        commentEditor.innerHTML = commentText.startsWith('\n') ? commentText.substring(1) : commentText
        setWorkCommentContent(commentText.startsWith('\n') ? commentText.substring(1) : commentText)
      }
    }, 0)
  }, [setWorkForm, setWorkTaskId, setIsWorkAreaReadOnly, setWorkResolvedFileKeys, setWorkCommentResolvedFileKeys, setWorkCommentContent])

  // 상태별로 task 분류 (시간 순으로 정렬)
  const pendingTasks = useMemo(() => 
    tasks.filter(t => t.status === 'pending').sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ), [tasks]
  )
  const inProgressTasks = useMemo(() => 
    tasks.filter(t => t.status === 'in_progress').sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ), [tasks]
  )
  const onHoldTasks = useMemo(() => 
    tasks.filter(t => t.status === 'on_hold').sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ), [tasks]
  )
  const awaitingCompletionTasks = useMemo(() => 
    tasks.filter(t => t.status === 'awaiting_completion').sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ), [tasks]
  )
  const completedTasks = useMemo(() => 
    tasks.filter(t => t.status === 'completed').sort((a, b) => 
      new Date(b.completed_at || b.created_at).getTime() - new Date(a.completed_at || a.created_at).getTime()
    ), [tasks]
  )

  return {
    loadTasks,
    handleStatusChange,
    handleWorkAreaDrop,
    pendingTasks,
    inProgressTasks,
    onHoldTasks,
    awaitingCompletionTasks,
    completedTasks,
  }
}
