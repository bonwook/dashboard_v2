import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface CalendarHeaderProps {
  date: Date
  onMonthChange: (delta: number) => void
  children?: React.ReactNode
}

export function CalendarHeader({ date, onMonthChange, children }: CalendarHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Calendar</h2>
        {children}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => onMonthChange(-1)}
          className="h-8 w-8"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-sm font-medium min-w-[120px] text-center">
          {format(date, 'yyyy년 MM월')}
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => onMonthChange(1)}
          className="h-8 w-8"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
