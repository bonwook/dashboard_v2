"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { useCalendar } from "@/lib/hooks/useCalendar"
import { CalendarHeader } from "./calendar/CalendarHeader"
import { CalendarDay } from "./calendar/CalendarDay"
import { CalendarTaskItem } from "./calendar/CalendarTaskItem"
import { CalendarAssignedToMeToggle } from "./calendar/CalendarAssignedToMeToggle"
import { TaskDetailDialog } from "./task/TaskDetailDialog"

export function AdminCalendar() {
  const [selectedTask, setSelectedTask] = useState<any>(null)
  const [showOnlyAssignedToMe, setShowOnlyAssignedToMe] = useState(false)
  const {
    calendarDate,
    isLoading,
    formatCalendarDate,
    getTodayInKorea,
    getDayTasks,
    changeMonth,
    calendarDays,
    loadCalendarData,
    getKoreanHoliday,
  } = useCalendar({ assignedToMeOnly: showOnlyAssignedToMe })

  // 유틸리티 함수들
  const getDueRangeKey = useCallback((task: any) => {
    return task?.due_range_task_id || task?.id || ""
  }, [])

  const hexToRgb = useCallback((hex: string) => {
    const normalized = hex.replace("#", "").trim()
    const full = normalized.length === 3
      ? normalized.split("").map((c) => c + c).join("")
      : normalized
    const r = Number.parseInt(full.slice(0, 2), 16)
    const g = Number.parseInt(full.slice(2, 4), 16)
    const b = Number.parseInt(full.slice(4, 6), 16)
    return { r, g, b }
  }, [])

  const rgbWithAlpha = useCallback((hex: string, alpha: number) => {
    const { r, g, b } = hexToRgb(hex)
    return `rgb(${r} ${g} ${b} / ${alpha})`
  }, [hexToRgb])

  const getDueRangeColor = useCallback((key: string) => {
    const palette = [
      "#1D4ED8", "#0F766E", "#7C3AED", "#B45309", "#BE123C",
      "#374151", "#15803D", "#9A3412", "#6D28D9",
    ]
    let hash = 0
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
    return palette[hash % palette.length]
  }, [])

  const getPriorityBorderColor = useCallback((priority: unknown) => {
    switch (priority) {
      case "urgent": return "#ef4444"
      case "high": return "#f97316"
      case "medium": return "#eab308"
      case "low": return "#3b82f6"
      default: return "#6b7280"
    }
  }, [])

  const truncateByBytes = useCallback((input: string, maxBytes: number) => {
    const encoder = new TextEncoder()
    let bytes = 0
    let out = ""
    for (const ch of input) {
      const b = encoder.encode(ch).length
      if (bytes + b > maxBytes) break
      bytes += b
      out += ch
    }
    return out
  }, [])

  const getDisplayTitle = useCallback((title: unknown) => {
    const t = typeof title === "string" ? title : ""
    const byChars = Array.from(t).slice(0, 8).join("")
    const byBytes = truncateByBytes(t, 16)
    return byBytes.length < byChars.length ? byBytes : byChars
  }, [truncateByBytes])

  useEffect(() => {
    loadCalendarData()
  }, [loadCalendarData])

  const handleTaskClick = useCallback((task: any, taskType: string) => {
    setSelectedTask({ ...task, task_type: taskType })
  }, [])

  const filterTasks = useCallback((tasks: any[], dayStr: string) => {
    // API에서 이미 필터링을 했으므로 정렬만 수행
    return tasks.sort((a: any, b: any) => {
      const ak = getDueRangeKey(a)
      const bk = getDueRangeKey(b)
      return ak.localeCompare(bk)
    })
  }, [getDueRangeKey])

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-muted-foreground">로딩 중...</div>
        </CardContent>
      </Card>
    )
  }

  const weekDays = ['일', '월', '화', '수', '목', '금', '토']
  const TASK_WIDTH = "w-[72%]"

  return (
    <>
      <Card>
        <CardHeader>
          <div className="w-full">
            <CalendarHeader date={calendarDate} onMonthChange={changeMonth}>
              <CalendarAssignedToMeToggle
                checked={showOnlyAssignedToMe}
                onCheckedChange={setShowOnlyAssignedToMe}
              />
            </CalendarHeader>
          </div>
        </CardHeader>
        <CardContent>
          <div className="w-full">
            <div className="grid grid-cols-7 gap-1 mb-2">
              {weekDays.map((day) => (
                <div key={day} className="text-xs font-semibold text-center text-muted-foreground py-2">
                  {day}
                </div>
              ))}
            </div>
            
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
                    <div className="flex-1 flex flex-col items-center gap-1 overflow-y-auto">
                      {filterTasks(tasks.assigned, dayStr).map((task: any, taskIndex: number) => (
                          <CalendarTaskItem
                            key={`assigned-${task.id}-${taskIndex}`}
                            task={task}
                            taskIndex={taskIndex}
                            taskType="assigned"
                            dayStr={dayStr}
                            formatCalendarDate={formatCalendarDate}
                            getDueRangeKey={getDueRangeKey}
                            getDueRangeColor={getDueRangeColor}
                            getPriorityBorderColor={getPriorityBorderColor}
                            rgbWithAlpha={rgbWithAlpha}
                            getDisplayTitle={getDisplayTitle}
                            TASK_WIDTH={TASK_WIDTH}
                            onClick={handleTaskClick}
                          />
                        ))}
                      
                      {filterTasks(tasks.received, dayStr).map((task: any, taskIndex: number) => (
                        <CalendarTaskItem
                          key={`received-${task.id}-${taskIndex}`}
                          task={task}
                          taskIndex={taskIndex}
                          taskType="received"
                          dayStr={dayStr}
                          formatCalendarDate={formatCalendarDate}
                          getDueRangeKey={getDueRangeKey}
                          getDueRangeColor={getDueRangeColor}
                          getPriorityBorderColor={getPriorityBorderColor}
                          rgbWithAlpha={rgbWithAlpha}
                          getDisplayTitle={getDisplayTitle}
                          TASK_WIDTH={TASK_WIDTH}
                          onClick={handleTaskClick}
                        />
                      ))}
                    </div>
                  </CalendarDay>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <TaskDetailDialog
        task={selectedTask}
        open={!!selectedTask}
        onOpenChange={(open) => !open && setSelectedTask(null)}
        onTaskUpdate={loadCalendarData}
      />
    </>
  )
}
