"use client"

import { useCallback } from "react"
import { Users } from "lucide-react"
import { parseDateOnly } from "@/lib/utils/dateHelpers"

interface CalendarTaskItemProps {
  task: any
  taskIndex: number
  taskType: 'assigned' | 'received'
  dayStr: string
  formatCalendarDate: (date: Date) => string
  getDueRangeKey: (task: any) => string
  getDueRangeColor: (key: string) => string
  getPriorityBorderColor: (priority: unknown) => string
  rgbWithAlpha: (hex: string, alpha: number) => string
  getDisplayTitle: (title: unknown) => string
  TASK_WIDTH: string
  onClick: (task: any, taskType: string) => void
}

export function CalendarTaskItem({
  task,
  taskIndex,
  taskType,
  dayStr,
  formatCalendarDate,
  getDueRangeKey,
  getDueRangeColor,
  getPriorityBorderColor,
  rgbWithAlpha,
  getDisplayTitle,
  TASK_WIDTH,
  onClick,
}: CalendarTaskItemProps) {
  
  const getStatusColor = useCallback((status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/25 text-green-900 dark:text-green-100 border-green-500/20 hover:bg-green-500/35 hover:border-green-500/30'
      case 'awaiting_completion':
        return 'bg-purple-500/25 text-purple-900 dark:text-purple-100 border-purple-500/20 hover:bg-purple-500/35 hover:border-purple-500/30'
      case 'in_progress':
        return 'bg-blue-500/25 text-blue-900 dark:text-blue-100 border-blue-500/20 hover:bg-blue-500/35 hover:border-blue-500/30'
      case 'on_hold':
        return 'bg-yellow-500/25 text-yellow-900 dark:text-yellow-100 border-yellow-500/20 hover:bg-yellow-500/35 hover:border-yellow-500/30'
      case 'pending':
      default:
        return 'bg-gray-500/25 text-gray-900 dark:text-gray-100 border-gray-500/20 hover:bg-gray-500/35 hover:border-gray-500/30'
    }
  }, [])

  const statusColor = getStatusColor(task.status || 'pending')
  const dueDateParsed = parseDateOnly(task.due_date)
  const isDueDateEnd = Boolean(dueDateParsed && formatCalendarDate(dueDateParsed) === dayStr)
  const isCompletedDay = Boolean(task?.status === "completed" && task?.completed_at && formatCalendarDate(new Date(task.completed_at)) === dayStr)
  const priorityBorder = getPriorityBorderColor(task?.priority)
  const hasMultipleAssignees = task.assignees && task.assignees.length > 0

  return (
    <div className="w-full flex justify-center">
      <div
        className={`h-[26px] text-[10px] px-2 rounded border-2 truncate font-medium shrink-0 cursor-pointer transition-colors ${TASK_WIDTH} mx-auto flex items-center justify-center text-center shadow-none gap-1 ${
          isDueDateEnd ? "text-slate-900 dark:text-slate-50" : statusColor
        }`}
        onClick={(e) => {
          e.stopPropagation()
          onClick(task, taskType)
        }}
        title={hasMultipleAssignees 
          ? `${task.title || ""} (담당자: ${task.assignees.map((a: any) => a.name || a.email).join(', ')})`
          : task.title || ""}
        style={isDueDateEnd
          ? (() => {
            const dueKey = getDueRangeKey(task)
            const dueColor = getDueRangeColor(dueKey)
            return {
              borderColor: priorityBorder,
              backgroundColor: rgbWithAlpha(dueColor, 0.14),
            }
          })()
          : isCompletedDay
            ? ({
              borderColor: priorityBorder,
              backgroundColor: rgbWithAlpha("#22c55e", 0.10),
            } as any)
            : ({ borderColor: priorityBorder } as any)}
      >
        {hasMultipleAssignees && (
          <Users className="h-3 w-3 shrink-0" />
        )}
        <span className="truncate">{getDisplayTitle(task.title)}</span>
      </div>
    </div>
  )
}
