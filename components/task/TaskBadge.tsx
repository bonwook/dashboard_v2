import { Badge } from "@/components/ui/badge"
import { getStatusBadgeVariant, getStatusLabel, getPriorityBadgeColor, getPriorityLabel } from "@/lib/utils/taskHelpers"

interface TaskStatusBadgeProps {
  status: string
  className?: string
}

export function TaskStatusBadge({ status, className }: TaskStatusBadgeProps) {
  return (
    <Badge className={`${getStatusBadgeVariant(status)} text-xs whitespace-nowrap shrink-0 ${className || ''}`}>
      {getStatusLabel(status)}
    </Badge>
  )
}

interface TaskPriorityBadgeProps {
  priority: string
  className?: string
}

export function TaskPriorityBadge({ priority, className }: TaskPriorityBadgeProps) {
  return (
    <Badge className={`${getPriorityBadgeColor(priority)} ${className || ''}`}>
      {getPriorityLabel(priority)}
    </Badge>
  )
}
