import { useContentEditor } from "@/lib/hooks/useContentEditor"

export function useEditor(
  assignForm: { title: string; content: string; priority: string },
  setAssignForm: (form: any) => void
) {
  return useContentEditor({
    editorId: 'assign-content',
    // onContentChange를 제거하여 실시간 상태 업데이트 방지
    // onBlur에서만 상태 업데이트
  })
}
