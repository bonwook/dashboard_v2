import { useState, useCallback } from "react"
import { useToast } from "@/hooks/use-toast"

interface UseSubtaskCompletionOptions {
  onSuccess?: () => void
}

/**
 * 서브태스크 완료 처리를 위한 Hook
 * - 서브태스크 상태를 completed로 변경
 * - 완료 시각 자동 기록
 * - 캘린더 및 report 자동 업데이트
 */
export function useSubtaskCompletion({ onSuccess }: UseSubtaskCompletionOptions = {}) {
  const [isCompleting, setIsCompleting] = useState(false)
  const { toast } = useToast()

  const completeSubtask = useCallback(async (subtaskId: string) => {
    setIsCompleting(true)
    try {
      const res = await fetch(`/api/tasks/subtasks/${subtaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "completed" }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "작업 완료 처리 실패")
      }

      toast({
        title: "작업이 완료되었습니다",
        description: "캘린더와 리포트가 자동으로 업데이트되었습니다.",
      })

      onSuccess?.()
      return true
    } catch (e: any) {
      toast({
        title: "작업 완료 처리 실패",
        description: e.message || "작업을 완료하는 중 오류가 발생했습니다.",
        variant: "destructive",
      })
      return false
    } finally {
      setIsCompleting(false)
    }
  }, [toast, onSuccess])

  return {
    completeSubtask,
    isCompleting,
  }
}
