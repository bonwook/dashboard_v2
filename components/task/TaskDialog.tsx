"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FileText, Users } from "lucide-react"
import { TaskStatusBadge, TaskPriorityBadge } from "./TaskBadge"
import { formatDateTime } from "@/lib/utils/taskHelpers"
import { sanitizeHtml } from "@/lib/utils/sanitize"
import { getRoleLabel, getRoleName } from "@/lib/utils/taskStatusHelpers"

interface TaskDialogProps {
  task: any | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TaskDialog({ task, open, onOpenChange }: TaskDialogProps) {
  const [subtasks, setSubtasks] = useState<any[]>([])
  const [assignmentType, setAssignmentType] = useState<string>('single')
  
  // subtasks 로드: task.subtasks가 이미 있으면 사용, 없으면 API 호출
  useEffect(() => {
    if (task && task.id && !task.is_subtask) {
      // 캘린더 API에서 이미 subtasks를 포함한 경우
      if (task.subtasks && Array.isArray(task.subtasks)) {
        setSubtasks(task.subtasks)
        setAssignmentType(task.assignment_type || 'multiple')
      } else {
        // 기존 방식: API 호출
        const loadSubtasks = async () => {
          try {
            const response = await fetch(`/api/tasks/${task.id}/subtasks`, {
              credentials: 'include'
            })
            if (response.ok) {
              const data = await response.json()
              setSubtasks(data.subtasks || [])
              setAssignmentType(data.assignment_type || task.assignment_type || 'single')
            }
          } catch (error) {
            // Failed to load subtasks
          }
        }
        loadSubtasks()
      }
    } else {
      setSubtasks([])
      setAssignmentType(task?.assignment_type || 'single')
    }
  }, [task])
  
  if (!task) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-hidden flex flex-col" style={{ width: 'calc((1280px - 48px - 16px) * 7/10)', maxWidth: '851px' }}>
        {/* 제목 + 태그 + 파일 */}
        <DialogHeader className="pr-8 shrink-0">
          <div className="flex items-start gap-3 flex-wrap">
            <DialogTitle className="wrap-break-word word-break break-all flex-1 min-w-0">
              {task.title}
              {task.subtitle && task.is_subtask && (
                <span className="text-muted-foreground text-sm ml-2">({task.subtitle})</span>
              )}
            </DialogTitle>
            <div className="flex items-center gap-2 flex-shrink-0">
              {task.priority && <TaskPriorityBadge priority={task.priority} />}
              <TaskStatusBadge status={task.status} />
              {task.file_keys && Array.isArray(task.file_keys) && task.file_keys.length > 0 && (
                <div className="flex items-center gap-1 text-muted-foreground border border-border rounded-full px-2 py-0.5">
                  <FileText className="h-3 w-3" />
                  <span className="text-xs font-medium">{task.file_keys.length}</span>
                </div>
              )}
            </div>
          </div>
        </DialogHeader>
        
        {/* 간결한 헤더: 담당자 + 날짜 */}
        <div className="shrink-0 pb-3 border-b space-y-2">
          {/* 담당자 + 날짜 정보 (한 줄) */}
          <div className="flex items-center gap-4 text-sm flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">
                {getRoleLabel(task.task_type)}
              </span>
              <span className="font-medium">
                {getRoleName(
                  task.task_type,
                  task.assigned_to_name,
                  task.assigned_to_email,
                  task.assigned_by_name,
                  task.assigned_by_email
                )}
              </span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">시작</span>
              <span className="font-medium text-xs">{formatDateTime(task.created_at || new Date().toISOString())}</span>
            </div>
            {task.due_date && (
              <>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-2">
                  <span className="text-orange-600 dark:text-orange-400 text-xs">마감</span>
                  <span className="font-medium text-xs text-orange-700 dark:text-orange-300">{formatDateTime(task.due_date)}</span>
                </div>
              </>
            )}
            {task.completed_at && (
              <>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-2">
                  <span className="text-green-600 dark:text-green-400 text-xs">종료</span>
                  <span className="font-medium text-xs text-green-700 dark:text-green-300">{formatDateTime(task.completed_at)}</span>
                </div>
              </>
            )}
          </div>
          
          {/* Subtask 담당자들 */}
          {subtasks.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Users className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">
                  공동 담당자
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {subtasks.map((subtask: any, index: number) => (
                  <div 
                    key={subtask.id || index}
                    className="inline-flex items-center gap-1 bg-blue-100 dark:bg-blue-950 border border-blue-300 dark:border-blue-700 rounded-full px-2 py-0.5"
                  >
                    <span className="text-xs font-medium">
                      {subtask.assigned_to_name || subtask.assigned_to_email || 'Unknown'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* 스크롤 가능한 본문 영역 */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden mt-4">
          {task.content ? (
            <div 
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
              className="text-sm bg-muted/50 p-3 rounded-md border border-border/50 wrap-break-word word-break break-all overflow-x-auto prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(task.content) }}
              style={{
                whiteSpace: 'pre-wrap'
              }}
            />
          ) : (
            <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-md border border-border/50 text-center">
              본문이 없습니다
            </div>
          )}
          <style jsx global>{`
            .prose table {
              border-collapse: collapse;
              width: 100%;
              margin: 10px 0;
              border: 2px solid #6b7280;
            }
            .prose table td,
            .prose table th {
              border: 2px solid #6b7280;
              padding: 8px;
              position: relative;
              cursor: default !important;
            }
            .prose table td[contenteditable="true"],
            .prose table th[contenteditable="true"] {
              pointer-events: none;
              user-select: none;
              cursor: default !important;
            }
            .prose table td *,
            .prose table th * {
              cursor: default !important;
              pointer-events: none;
            }
            .prose hr {
              border: none;
              border-top: 2px solid #6b7280;
              margin: 10px 0;
            }
          `}</style>
        </div>
      </DialogContent>
    </Dialog>
  )
}
