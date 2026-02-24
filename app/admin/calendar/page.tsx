"use client"

import { useState, useEffect, useCallback, lazy, Suspense } from "react"
import { Card } from "@/components/ui/card"
import { useCalendar } from "@/lib/hooks/useCalendar"
import { useTaskData } from "@/lib/hooks/useTaskData"
import { CalendarHeader } from "@/components/calendar/CalendarHeader"
import { CalendarDay } from "@/components/calendar/CalendarDay"
import { TaskCard } from "@/components/task/TaskCard"
import { getTaskStatusColor, isTaskOverdue } from "@/lib/utils/taskHelpers"

// 동적 import: TaskDetailDialog는 사용자가 태스크 클릭 시에만 필요 (progress와 동일 UI/기능)
const TaskDetailDialog = lazy(() => import("@/components/task/TaskDetailDialog").then(mod => ({ default: mod.TaskDetailDialog })))

export default function AdminCalendarPage() {
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
    assignedByTasks,
    taskCounts,
    assignedByCounts,
  } = useTaskData()

  const [selectedTask, setSelectedTask] = useState<any>(null)

  useEffect(() => {
    loadCalendarData()
  }, [loadCalendarData])

  const handleTaskClick = useCallback((task: any, type: string) => {
    setSelectedTask({ ...task, task_type: type })
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
      {/* 상단: Assign/Assigned 카드 */}
      <div className="mb-8 grid gap-4 md:grid-cols-2 md:h-[210px]">
        <TaskCard
          title="보낸 요청"
          count={assignedByCounts.total}
          tasks={assignedByTasks}
          onTaskClick={handleTaskClick}
          taskType="assigned"
        />
        <TaskCard
          title="받은 요청"
          count={taskCounts.total}
          tasks={assignedTasks}
          onTaskClick={handleTaskClick}
          taskType="received"
        />
      </div>

      {/* 하단: 캘린더 */}
      <Card>
        <div className="p-6">
          <CalendarHeader date={calendarDate} onMonthChange={changeMonth} />
          
          {/* 색상 범례 */}
          <div className="flex items-center gap-4 mt-4 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border-2 bg-purple-500/25 border-purple-500/20"></div>
              <span className="text-xs text-muted-foreground">완료대기</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border-2 bg-blue-500/25 border-blue-500/20"></div>
              <span className="text-xs text-muted-foreground">작업</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border-2 bg-yellow-500/25 border-yellow-500/20"></div>
              <span className="text-xs text-muted-foreground">보류</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border-2 bg-gray-500/25 border-gray-500/20"></div>
              <span className="text-xs text-muted-foreground">대기</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border-2 bg-red-500/25 border-red-500/20"></div>
              <span className="text-xs text-muted-foreground">마감</span>
            </div>
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
                    {/* 등록한 업무 (assign) */}
                    {tasks.assigned.map((task: any, taskIndex: number) => {
                      const overdue = isTaskOverdue(task)
                      const statusColor = getTaskStatusColor(task.status, overdue)
                      
                      return (
                        <div
                          key={`assigned-${task.id}-${taskIndex}`}
                          className={`text-[10px] px-2 py-1.5 rounded border-2 ${statusColor} truncate leading-tight font-medium shadow-sm shrink-0 cursor-pointer transition-colors w-[80%]`}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleTaskClick(task, 'assigned')
                          }}
                        >
                          {task.title}
                        </div>
                      )
                    })}
                    
                    {/* 지정받은 업무 (received) */}
                    {tasks.received.map((task: any, taskIndex: number) => {
                      const overdue = isTaskOverdue(task)
                      const statusColor = getTaskStatusColor(task.status, overdue)
                      
                      return (
                        <div
                          key={`received-${task.id}-${taskIndex}`}
                          className={`text-[10px] px-2 py-1.5 rounded border-2 ${statusColor} truncate leading-tight font-medium shadow-sm shrink-0 cursor-pointer transition-colors w-[80%]`}
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
          showCompleteButton={false}
        />
      </Suspense>
    </div>
  )
}
