import { useContentEditor } from "@/lib/hooks/useContentEditor"

export function useCommentEditor(onContentChange: (content: string) => void) {
  return useContentEditor({
    editorId: 'work-comment-content',
    onContentChange
  })
}
