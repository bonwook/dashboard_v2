import { format, isSameMonth } from "date-fns"

interface CalendarDayProps {
  day: Date
  currentMonth: Date
  isToday: boolean
  holiday: string | null
  children?: React.ReactNode
}

export function CalendarDay({ day, currentMonth, isToday, holiday, children }: CalendarDayProps) {
  const isCurrentMonth = isSameMonth(day, currentMonth)
  const isHoliday = holiday !== null
  
  return (
    <div
      className={`
        relative rounded-md
        ${isToday ? 'border-2 border-blue-400/40 dark:border-blue-400/30' : isHoliday ? 'border border-red-300/50 dark:border-red-500/30' : 'border border-border/50'}
        ${isHoliday ? 'bg-red-50/30 dark:bg-red-950/10' : ''}
        ${isCurrentMonth ? (isHoliday ? '' : 'bg-background') : 'bg-muted/30 opacity-30'}
        ${isToday ? 'ring-2 ring-blue-400/10 dark:ring-blue-400/10' : ''}
        min-h-[120px] p-1.5
        flex flex-col
        transition-all duration-200
        cursor-default
      `}
    >
      <div className="text-sm font-semibold text-left mb-1 pb-1 leading-none border-b border-border/30">
        <div className="flex items-center gap-1">
          <span>{format(day, 'd')}</span>
          {holiday && (
            <span className="text-[10px] text-red-500 dark:text-red-400 font-medium">
              {holiday}
            </span>
          )}
        </div>
      </div>
      
      <div className="flex-1 flex flex-col gap-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
