import { parseDateOnly, parseFlexibleDate } from "@/lib/utils/dateHelpers"

export function getStatusBadgeVariant(status: string) {
  switch (status) {
    case "completed":
      return "bg-green-500/10 text-green-500"
    case "awaiting_completion":
      return "bg-purple-500/10 text-purple-500"
    case "in_progress":
      return "bg-blue-500/10 text-blue-500"
    case "on_hold":
      return "bg-yellow-500/10 text-yellow-500"
    case "pending":
      return "bg-gray-500/10 text-gray-500"
    default:
      return "bg-gray-500/10 text-gray-500"
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case "completed":
      return "완료"
    case "awaiting_completion":
      return "완료대기"
    case "in_progress":
      return "작업"
    case "on_hold":
      return "보류"
    case "pending":
      return "대기"
    default:
      return "알 수 없음"
  }
}

export function getPriorityBorderColor(priority: string): string {
  switch (priority) {
    case 'urgent':
      return 'border-red-500/20'
    case 'high':
      return 'border-orange-500/20'
    case 'medium':
      return 'border-yellow-500/20'
    case 'low':
      return 'border-blue-500/20'
    default:
      return 'border-border'
  }
}

export function getPriorityLabel(priority: string): string {
  switch (priority) {
    case 'urgent':
      return '긴급'
    case 'high':
      return '높음'
    case 'medium':
      return '보통'
    case 'low':
      return '낮음'
    default:
      return '보통'
  }
}

export function getPriorityBadgeColor(priority: string): string {
  switch (priority) {
    case 'urgent':
      return 'bg-red-500 text-white'
    case 'high':
      return 'bg-orange-500 text-white'
    case 'medium':
      return 'bg-yellow-500 text-white'
    case 'low':
      return 'bg-blue-500 text-white'
    default:
      return 'bg-gray-500 text-white'
  }
}

export function getTaskStatusColor(status: string, isOverdue: boolean = false): string {
  if (isOverdue) {
    return 'bg-red-500/25 text-red-900 dark:text-red-100 border-red-500/20 hover:bg-red-500/35 hover:border-red-500/30'
  }
  
  switch (status) {
    case 'completed':
      return 'bg-green-500/25 text-green-900 dark:text-green-100 border-green-500/20 hover:bg-green-500/35 hover:border-green-500/30'
    case 'awaiting_completion':
      return 'bg-purple-500/25 text-purple-900 dark:text-purple-100 border-purple-500/20 hover:bg-purple-500/35 hover:border-purple-500/30'
    case 'in_progress':
      return 'bg-blue-500/25 text-blue-900 dark:text-blue-100 border-blue-500/20 hover:bg-blue-500/35 hover:border-blue-500/30'
    case 'on_hold':
      return 'bg-yellow-500/25 text-yellow-900 dark:text-yellow-100 border-yellow-500/20 hover:bg-yellow-500/35 hover:border-yellow-500/30'
    case 'pending':
    default:
      return 'bg-gray-500/25 text-gray-900 dark:text-gray-100 border-gray-500/20 hover:bg-gray-500/35 hover:border-gray-500/30'
  }
}

export function isTaskOverdue(task: any): boolean {
  if (!task.due_date || task.status === 'completed' || task.status === 'awaiting_completion') {
    return false
  }
  const dueDate = parseDateOnly(task.due_date)
  if (!dueDate) return false
  const now = new Date()
  const koreaDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }))
  const today = new Date(koreaDate.getFullYear(), koreaDate.getMonth(), koreaDate.getDate())
  const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
  return dueDateOnly < today
}

/**
 * 작업이 마감되었는지 판단 (완료 상태만 제외)
 * - 완료 상태가 아니고 마감일이 지난 경우 true 반환
 * - admin/cases 페이지의 "마감" 탭에서 사용
 */
export function isTaskExpired(task: any): boolean {
  // 마감일이 없거나 이미 완료된 경우는 마감된 것으로 분류하지 않음
  if (!task.due_date || task.status === 'completed') {
    return false
  }
  const dueDate = parseDateOnly(task.due_date)
  if (!dueDate) return false
  const now = new Date()
  const koreaDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }))
  const today = new Date(koreaDate.getFullYear(), koreaDate.getMonth(), koreaDate.getDate())
  const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
  return dueDateOnly < today
}

export function formatDateTime(dateString: string): string {
  const date = parseFlexibleDate(dateString)
  if (!date) return "-"
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul'
  })
  return formatter.format(date)
}

export function getStatusBorderColor(status: string): string {
  switch (status) {
    case "completed":
      return 'border-green-500/60 hover:border-green-500/80'
    case "awaiting_completion":
      return 'border-purple-500/60 hover:border-purple-500/80'
    case "in_progress":
      return 'border-blue-500/60 hover:border-blue-500/80'
    case "on_hold":
      return 'border-yellow-500/60 hover:border-yellow-500/80'
    case "pending":
      return 'border-gray-500/60 hover:border-gray-500/80'
    default:
      return 'border-gray-500/60 hover:border-gray-500/80'
  }
}
