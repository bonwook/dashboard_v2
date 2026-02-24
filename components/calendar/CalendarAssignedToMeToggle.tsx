"use client"

import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

interface CalendarAssignedToMeToggleProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** 스위치 비활성화 여부 (예: 로딩 중) */
  disabled?: boolean
}

/**
 * 캘린더에서 "내게 부여된 업무만 보기" 토글.
 * 개별 할당(assigned_to) 및 다중 할당(subtask assignees) 모두 포함된 received 목록만 표시할 때 사용.
 */
export function CalendarAssignedToMeToggle({
  checked,
  onCheckedChange,
  disabled = false,
}: CalendarAssignedToMeToggleProps) {
  return (
    <div className="flex items-center gap-2">
      <Switch
        id="calendar-assigned-to-me"
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
      <Label
        htmlFor="calendar-assigned-to-me"
        className="text-sm font-medium cursor-pointer select-none text-muted-foreground"
      >
        내 업무만 보기
      </Label>
    </div>
  )
}
