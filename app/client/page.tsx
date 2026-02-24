"use client"

import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ClipboardList } from "lucide-react"
import { useCalendar } from "@/lib/hooks/useCalendar"
import { useTaskData } from "@/lib/hooks/useTaskData"
import { CalendarHeader } from "@/components/calendar/CalendarHeader"
import { CalendarDay } from "@/components/calendar/CalendarDay"
import { TaskStatusBadge } from "@/components/task/TaskBadge"
import { getTaskStatusColor, isTaskOverdue, getPriorityBorderColor, getStatusBorderColor } from "@/lib/utils/taskHelpers"

// 동적 import: TaskDetailDialog는 사용자가 태스크 클릭 시에만 필요 (progress와 동일 UI/기능)
const TaskDetailDialog = lazy(() => import("@/components/task/TaskDetailDialog").then(mod => ({ default: mod.TaskDetailDialog })))

export default function ClientDashboardPage() {
  const {
    calendarDate,
    isLoading: calendarLoading,
    formatCalendarDate,
    getTodayInKorea,
    getDayTasks,
    changeMonth,
    calendarDays,
    loadCalendarData,
    getKoreanHoliday,
  } = useCalendar()

  const {
    isLoading: taskLoading,
    assignedTasks,
    taskCounts,
  } = useTaskData()

  const [selectedTask, setSelectedTask] = useState<any>(null)

  useEffect(() => {
    loadCalendarData()
  }, [loadCalendarData])

  const handleTaskClick = useCallback((task: any, type: string) => {
    setSelectedTask({ ...task, task_type: type })
  }, [])

  // 태스크 필터링 로직 (API에서 이미 필터링됨)
  const filterTasks = useCallback((tasks: any[], dayStr: string) => {
    return tasks
  }, [])

  if (calendarLoading || taskLoading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <div className="text-muted-foreground">로딩 중...</div>
        </div>
      </div>
    )
  }

  const weekDays = ['일', '월', '화', '수', '목', '금', '토']

  return (
    <div className="relative mx-auto max-w-7xl p-6">
      {/* 상단: 받은 요청만 표시 */}
      <div className="mb-8">
        <Card className="min-h-[300px] flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2 shrink-0">
            <div className="flex items-center gap-4">
              <div>
                <CardTitle className="text-sm font-medium">받은 요청 ({taskCounts.total})</CardTitle>
              </div>
            </div>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto min-h-0">
            <div className="grid gap-3" style={{ 
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gridAutoRows: '140px'
            }}>
              {assignedTasks && assignedTasks.length > 0 ? (
                assignedTasks.map((task) => (
                  <div 
                    key={task.id} 
                    className={`p-3 bg-muted/50 rounded-lg border-[3px] ${getStatusBorderColor(task.status)} font-medium shadow-sm cursor-pointer hover:bg-muted hover:shadow-md transition-all flex flex-col items-center justify-center gap-2 text-center relative overflow-hidden`}
                    onClick={() => handleTaskClick(task, 'received')}
                  >
                    <div className="flex-1 flex items-center justify-center overflow-hidden w-full">
                      <span className="text-sm font-semibold line-clamp-3 wrap-break-word px-1">
                        {task.title}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground col-span-full text-center py-8">받은 업무가 없습니다</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 하단: 캘린더 */}
      <Card>
        <div className="p-6">
          <div className="mb-4">
            <CalendarHeader date={calendarDate} onMonthChange={changeMonth} />
          </div>

          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 gap-1 mb-2 mt-6">
            {weekDays.map((day) => (
              <div key={day} className="text-xs font-semibold text-center text-muted-foreground py-2">
                {day}
              </div>
            ))}
          </div>
          
          {/* 캘린더 격자 */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, index) => {
              const tasks = getDayTasks(day)
              const todayInKorea = getTodayInKorea()
              const dayStr = formatCalendarDate(day)
              const isTodayKorea = dayStr === todayInKorea
              const holiday = getKoreanHoliday(day)
              
              return (
                <CalendarDay
                  key={index}
                  day={day}
                  currentMonth={calendarDate}
                  isToday={isTodayKorea}
                  holiday={holiday}
                >
                  <div className="flex-1 flex flex-col gap-1 overflow-y-auto">
                    {/* 등록한 업무 (assigned) */}
                    {filterTasks(tasks.assigned, dayStr).map((task: any, taskIndex: number) => {
                        const overdue = isTaskOverdue(task)
                        const statusColor = getTaskStatusColor(task.status, overdue)
                        
                        return (
                          <div
                            key={`assigned-${task.id}-${taskIndex}`}
                            className={`text-[10px] px-2 py-1.5 rounded border-2 ${statusColor} truncate leading-tight font-medium shadow-sm shrink-0 cursor-pointer transition-colors w-[64%] mx-auto`}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleTaskClick(task, 'assigned')
                            }}
                          >
                            {task.title}
                          </div>
                        )
                      })}
                    
                    {/* 지정받은 업무 (received) - 개별/다중 할당 모두 포함 */}
                    {filterTasks(tasks.received, dayStr).map((task: any, taskIndex: number) => {
                      const overdue = isTaskOverdue(task)
                      const statusColor = getTaskStatusColor(task.status, overdue)
                      
                      return (
                        <div
                          key={`received-${task.id}-${taskIndex}`}
                          className={`text-[10px] px-2 py-1.5 rounded border-2 ${statusColor} truncate leading-tight font-medium shadow-sm shrink-0 cursor-pointer transition-colors w-[64%] mx-auto`}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleTaskClick(task, 'received')
                          }}
                        >
                          {task.title}
                        </div>
                      )
                    })}
                  </div>
                </CalendarDay>
              )
            })}
          </div>
        </div>
      </Card>

      <Suspense fallback={null}>
        <TaskDetailDialog
          task={selectedTask}
          open={!!selectedTask}
          onOpenChange={(open) => !open && setSelectedTask(null)}
          onTaskUpdate={loadCalendarData}
        />
      </Suspense>
    </div>
  )
}
