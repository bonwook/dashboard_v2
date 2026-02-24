import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, FileText } from "lucide-react"
import { Task, TaskStatus } from '../../types'

interface TaskBlockProps {
  task: Task
  onStatusChange: (taskId: string, newStatus: TaskStatus) => Promise<void>
  updatingTaskId: string | null
  getPriorityColor: (priority: Task['priority']) => string
  getStatusIcon: (status: Task['status']) => React.ReactElement | null
  getStatusLabel: (status: Task['status'], task?: Task) => string
  onDragStart: (e: React.DragEvent, task: Task) => void
  isDragging: boolean
  onTaskClick: (task: Task) => void
  workTaskId: string | null
}

export function TaskBlock({ 
  task, 
  onStatusChange, 
  updatingTaskId, 
  getPriorityColor, 
  getStatusIcon, 
  getStatusLabel,
  onDragStart,
  isDragging,
  onTaskClick,
  workTaskId
}: TaskBlockProps) {
  const isUpdating = updatingTaskId === task.id

  const handleClick = (e: React.MouseEvent) => {
    // 드래그 중이 아닐 때만 클릭 이벤트 처리
    if (!isDragging) {
      e.stopPropagation()
      onTaskClick(task)
    }
  }

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      className={`group relative ${
        isDragging ? 'opacity-50 cursor-move' : 'opacity-100 cursor-pointer'
      }`}
      onClick={handleClick}
    >
      <Card 
        className={`border-l-4 transition-all hover:shadow-md py-0 gap-0 ${
          isDragging ? 'scale-95' : 'scale-100'
        } ${
          workTaskId === task.id ? 'ring-2 ring-gray-400 ring-offset-1 border-gray-400' : ''
        }`}
        style={{ 
          borderLeftColor: task.status === 'completed' ? '#22c55e' : 
                          task.status === 'awaiting_completion' ? '#a855f7' : 
                          task.status === 'in_progress' ? '#3b82f6' : 
                          task.status === 'on_hold' ? '#eab308' : '#6b7280' 
        }}
      >
        <CardContent className="p-2 h-[55px] flex flex-col">
          <div className="flex-1 min-h-0 flex flex-col space-y-1">
            <div className="flex items-center gap-1 min-w-0">
              {getStatusIcon(task.status)}
              <Badge className={`${getPriorityColor(task.priority)} text-[9px] px-1 py-0 shrink-0`}>
                {task.priority === 'urgent' ? '긴급' : 
                 task.priority === 'high' ? '높음' : 
                 task.priority === 'medium' ? '보통' : '낮음'}
              </Badge>
              <span className="truncate text-[10px] text-muted-foreground min-w-0">{task.assigned_by_name || task.assigned_by_email}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">•</span>
              <span className="whitespace-nowrap text-[10px] text-muted-foreground shrink-0">{new Date(task.created_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}</span>
              {task.file_keys && task.file_keys.length > 0 && (
                <>
                  <span className="text-[10px] text-muted-foreground shrink-0">•</span>
                  <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="text-[9px] text-muted-foreground shrink-0">{task.file_keys.length}</span>
                </>
              )}
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <h3 className="font-medium text-sm truncate">
                {task.title}
                {task.is_subtask && task.subtitle && (
                  <span className="text-muted-foreground font-normal ml-1.5">({task.subtitle})</span>
                )}
              </h3>
            </div>
            {isUpdating && (
              <div className="flex items-center justify-center py-1 shrink-0">
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                <span className="text-[9px] text-muted-foreground ml-1">업데이트 중...</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
