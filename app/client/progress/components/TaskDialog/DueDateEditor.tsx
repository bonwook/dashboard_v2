"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Calendar as CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { ko } from "date-fns/locale"
import { useToast } from "@/hooks/use-toast"

interface DueDateEditorProps {
  taskId: string
  dueDate: string | null | undefined
  onUpdate: () => void
  userRole: string | null
}

export function DueDateEditor({ 
  taskId, 
  dueDate, 
  onUpdate,
  userRole 
}: DueDateEditorProps) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    dueDate ? new Date(dueDate) : null
  )
  const [isUpdating, setIsUpdating] = useState(false)
  const { toast } = useToast()

  const handleDateChange = async (date: Date | null) => {
    if (userRole === 'client') return // client는 수정 불가
    
    setSelectedDate(date)
    
    try {
      setIsUpdating(true)
      const dueDateValue = date ? format(date, "yyyy-MM-dd") : null
      
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          due_date: dueDateValue,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "마감일 업데이트 실패")
      }

      toast({
        title: "마감일이 업데이트되었습니다",
        description: date ? format(date, "yyyy년 MM월 dd일", { locale: ko }) : "마감일이 제거되었습니다",
      })

      onUpdate()
    } catch (error: any) {
      toast({
        title: "마감일 업데이트 실패",
        description: error.message || "마감일을 업데이트하는 중 오류가 발생했습니다.",
        variant: "destructive",
      })
      // 실패 시 원래 값으로 복원
      setSelectedDate(dueDate ? new Date(dueDate) : null)
    } finally {
      setIsUpdating(false)
    }
  }

  if (userRole === 'client') {
    return (
      <p className="font-medium">
        {dueDate ? format(new Date(dueDate), "yyyy년 MM월 dd일", { locale: ko }) : "설정되지 않음"}
      </p>
    )
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-start text-left font-normal h-9"
          disabled={isUpdating}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {selectedDate ? (
            format(selectedDate, "yyyy년 MM월 dd일", { locale: ko })
          ) : (
            <span className="text-muted-foreground">날짜 선택</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate || undefined}
          onSelect={(date) => handleDateChange(date || null)}
          initialFocus
        />
        {selectedDate && (
          <div className="p-3 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => handleDateChange(null)}
              disabled={isUpdating}
            >
              마감일 제거
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
