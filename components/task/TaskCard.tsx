import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ClipboardList } from "lucide-react"
import { getPriorityBorderColor, getTaskStatusColor, isTaskOverdue } from "@/lib/utils/taskHelpers"
import { TaskStatusBadge } from "./TaskBadge"

interface TaskCardProps {
  title: string
  count: number
  tasks: any[]
  onTaskClick: (task: any, type: string) => void
  taskType: 'assigned' | 'received'
  gridCols?: number
}

export function TaskCard({ title, count, tasks, onTaskClick, taskType, gridCols = 5 }: TaskCardProps) {
  // Tailwind는 동적 클래스를 지원하지 않으므로, 인라인 스타일 또는 정적 클래스 사용
  const gridColsClass = gridCols === 5 ? 'grid-cols-5' : gridCols === 4 ? 'grid-cols-4' : gridCols === 3 ? 'grid-cols-3' : 'grid-cols-5'
  const colSpanClass = gridCols === 5 ? 'col-span-5' : gridCols === 4 ? 'col-span-4' : gridCols === 3 ? 'col-span-3' : 'col-span-5'
  
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-2 shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <CardTitle className="text-sm font-medium">{title} ({count})</CardTitle>
          </div>
        </div>
        <ClipboardList className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto min-h-0">
        <div className={`grid ${gridColsClass} gap-2 auto-rows-min`}>
          {tasks && tasks.length > 0 ? (
            tasks.map((task) => {
              const overdue = isTaskOverdue(task)
              const statusColor = getTaskStatusColor(task.status, overdue)
              const borderColor = getPriorityBorderColor(task.priority || 'medium')
              
              return (
                <div 
                  key={task.id} 
                  className={`text-[9px] px-1.5 py-0.5 bg-muted/50 rounded border-2 ${borderColor} leading-tight font-medium shadow-sm shrink-0 cursor-pointer hover:bg-muted transition-colors flex items-center gap-1 min-w-0`}
                  onClick={() => onTaskClick(task, taskType)}
                >
                  <span className="truncate min-w-0 flex-1">{task.title}</span>
                  <TaskStatusBadge status={task.status} />
                </div>
              )
            })
          ) : (
            <p className={`text-xs text-muted-foreground ${colSpanClass}`}>
              {taskType === 'assigned' ? '등록한 업무가 없습니다' : '지정받은 업무가 없습니다'}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
