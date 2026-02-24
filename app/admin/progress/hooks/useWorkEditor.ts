import { Dispatch, SetStateAction } from "react"
import { useContentEditor } from "@/lib/hooks/useContentEditor"

export function useWorkEditor(
  workForm: { title: string; content: string; priority: string },
  setWorkForm: Dispatch<SetStateAction<{ title: string; content: string; priority: string }>>
) {
  return useContentEditor({
    editorId: 'work-content',
    onContentChange: (content) => setWorkForm({ ...workForm, content })
  })
}
