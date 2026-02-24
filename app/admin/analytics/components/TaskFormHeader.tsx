import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Calendar as CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { ko } from "date-fns/locale"
import { RefObject } from "react"

interface TaskFormHeaderProps {
  assignForm: {
    title: string
    priority: string
    due_date: Date | null
  }
  setAssignForm: (form: any) => void
  contentMode: 'single' | 'multi'
  prioritySelectRef: RefObject<HTMLButtonElement | null>
}

export function TaskFormHeader({
  assignForm,
  setAssignForm,
  contentMode,
  prioritySelectRef,
}: TaskFormHeaderProps) {
  return (
    <>
      {/* 제목 */}
      <div className="flex gap-4 items-start">
        <div className="space-y-2">
          <Label htmlFor="assign-title" className="text-base font-semibold">제목 *</Label>
          <Input
            id="assign-title"
            placeholder="제목을 입력하세요"
            value={assignForm.title}
            onChange={(e) => setAssignForm({ ...assignForm, title: e.target.value })}
            className="text-base h-12"
            style={{ width: '820px' }}
          />
        </div>
      </div>

      {/* 중요도, 마감일 가로 배치 */}
      <div className="flex items-end">
        <div className="space-y-2" style={{ width: '100px' }}>
          <Label htmlFor="assign-priority">중요도</Label>
          <Select
            value={assignForm.priority}
            onValueChange={(value) => setAssignForm({ ...assignForm, priority: value })}
          >
            <SelectTrigger id="assign-priority" ref={prioritySelectRef} className="h-auto py-2">
              {assignForm.priority === "low" && (
                <span className="px-2 py-1 rounded bg-gray-100 text-gray-700 text-sm font-medium">낮음</span>
              )}
              {assignForm.priority === "medium" && (
                <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-700 text-sm font-medium">보통</span>
              )}
              {assignForm.priority === "high" && (
                <span className="px-2 py-1 rounded bg-orange-100 text-orange-700 text-sm font-medium">높음</span>
              )}
              {assignForm.priority === "urgent" && (
                <span className="px-2 py-1 rounded bg-red-100 text-red-700 text-sm font-medium">긴급</span>
              )}
              {!assignForm.priority && (
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

        <div className="space-y-2">
          <Label htmlFor="assign-due-date">마감일</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id="assign-due-date"
                variant="outline"
                className={`h-auto py-2 ${assignForm.due_date ? 'px-3' : 'px-3'}`}
              >
                {assignForm.due_date ? (
                  <span className="text-sm">{format(assignForm.due_date, "MM/dd", { locale: ko })}</span>
                ) : (
                  <CalendarIcon className="h-4 w-4" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={assignForm.due_date || undefined}
                onSelect={(date) => setAssignForm({ ...assignForm, due_date: date || null })}
                className="assign-calendar"
              />
              <style jsx global>{`
                /* 오늘 날짜 배경색 및 테두리 제거 */
                .assign-calendar [data-today="true"] button {
                  background-color: transparent !important;
                  border: none !important;
                  box-shadow: none !important;
                }
                /* 선택되지 않은 날짜 테두리 제거 */
                .assign-calendar button:not([data-selected-single="true"]) {
                  border: none !important;
                  box-shadow: none !important;
                }
                /* hover 시 연한 파란색 배경 */
                .assign-calendar button:hover {
                  background-color: rgb(191 219 254 / 0.6) !important;
                }
              `}</style>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </>
  )
}
