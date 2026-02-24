import { Badge } from "@/components/ui/badge"

/**
 * 태스크 상태에 따른 Badge 컴포넌트 반환
 */
export function getStatusBadge(status: string) {
  switch (status) {
    case "completed":
      return <Badge className="bg-green-500/10 text-green-500">완료</Badge>
    case "awaiting_completion":
      return <Badge className="bg-purple-500/10 text-purple-500">완료대기</Badge>
    case "in_progress":
      return <Badge className="bg-blue-500/10 text-blue-500">작업중</Badge>
    case "on_hold":
      return <Badge className="bg-yellow-500/10 text-yellow-500">보류</Badge>
    case "pending":
      return <Badge className="bg-gray-500/10 text-gray-500">대기</Badge>
    default:
      return <Badge>{status}</Badge>
  }
}

/**
 * 태스크 상태에 따른 배경색 및 테두리 색상 반환
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case "completed":
      return "bg-green-500/10 border-green-500/30 hover:bg-green-500/20"
    case "awaiting_completion":
      return "bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20"
    case "in_progress":
      return "bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20"
    case "on_hold":
      return "bg-yellow-500/10 border-yellow-500/30 hover:bg-yellow-500/20"
    case "pending":
      return "bg-gray-500/10 border-gray-500/30 hover:bg-gray-500/20"
    default:
      return "bg-background border-border hover:bg-muted/50"
  }
}

/**
 * 태스크 상태에 따른 테두리 색상 반환
 */
export function getStatusBorderColor(status: string): string {
  switch (status) {
    case "completed":
      return "border-green-500"
    case "awaiting_completion":
      return "border-purple-500"
    case "in_progress":
      return "border-blue-500"
    case "on_hold":
      return "border-yellow-500"
    case "pending":
      return "border-gray-500"
    default:
      return "border-border"
  }
}

/**
 * 태스크 상태에 따른 글자 색상 클래스 반환 (Select 등에서 사용)
 */
export function getStatusTextColor(status: string): string {
  switch (status) {
    case "completed":
      return "text-green-500"
    case "awaiting_completion":
      return "text-purple-500"
    case "in_progress":
      return "text-blue-500"
    case "on_hold":
      return "text-yellow-500"
    case "pending":
      return "text-gray-500"
    default:
      return "text-foreground"
  }
}

/**
 * 중요도에 따른 Badge 컴포넌트 반환
 */
export function getPriorityBadge(priority: string) {
  switch (priority) {
    case "urgent":
      return <Badge className="bg-red-500 text-white">긴급</Badge>
    case "high":
      return <Badge className="bg-orange-500 text-white">높음</Badge>
    case "medium":
      return <Badge className="bg-yellow-500 text-white">보통</Badge>
    case "low":
      return <Badge className="bg-blue-500 text-white">낮음</Badge>
    default:
      return <Badge>{priority}</Badge>
  }
}

/**
 * task_type에 따른 역할 레이블 반환
 * - 'assigned': 본인이 요청한 업무 → 상대방은 "담당자"
 * - 'received': 본인이 받은 업무 → 상대방은 "요청자"
 */
export function getRoleLabel(taskType: string): string {
  return taskType === 'assigned' ? '담당자' : '요청자'
}

/**
 * task_type에 따른 역할 이름 반환
 * - 'assigned': 본인이 요청한 업무 → assigned_to_name 표시
 * - 'received': 본인이 받은 업무 → assigned_by_name 표시
 */
export function getRoleName(
  taskType: string,
  assignedToName?: string,
  assignedToEmail?: string,
  assignedByName?: string,
  assignedByEmail?: string
): string {
  if (taskType === 'assigned') {
    return assignedToName || assignedToEmail || 'Unknown'
  }
  return assignedByName || assignedByEmail || 'Unknown'
}
