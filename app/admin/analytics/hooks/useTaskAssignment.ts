import { useState, useCallback } from 'react'
import { format } from "date-fns"

interface UseTaskAssignmentProps {
  assignForm: {
    title: string
    content: string
    priority: string
    description: string
    due_date: Date | null
    assigned_to: string
  }
  subtasks: Array<{
    id: string
    subtitle: string
    assignedToList: string[]
    content: string
    fileKeys: string[]
  }>
  selectedFiles: Set<string>
  toast: any
  setAssignForm: (form: any) => void
  setSubtasks: (subtasks: any[]) => void
  setSelectedAssignees: (assignees: Set<string>) => void
  setSelectedFiles: (files: Set<string>) => void
  s3UpdateId?: string | null
}

export function useTaskAssignment(props: UseTaskAssignmentProps) {
  const {
    assignForm,
    subtasks,
    selectedFiles,
    toast,
    setAssignForm,
    setSubtasks,
    setSelectedAssignees,
    setSelectedFiles,
    s3UpdateId,
  } = props

  const [isAssigning, setIsAssigning] = useState(false)

  const handleAssignFiles = useCallback(async () => {
    if (!assignForm.title.trim()) {
      toast({
        title: "제목 필요",
        description: "업무 제목을 입력해주세요.",
        variant: "destructive",
      })
      return
    }

    if (subtasks.length > 0 && subtasks.some(s => s.assignedToList.length === 0)) {
      toast({
        title: "담당자 선택 필요",
        description: "모든 공동업무에 최소 1명 이상의 담당자를 추가해주세요.",
        variant: "destructive",
      })
      return
    }
    
    if (subtasks.length === 0 && (!assignForm.assigned_to || !assignForm.assigned_to.trim())) {
      toast({
        title: "담당자 선택 필요",
        description: "업무를 할당할 사용자를 선택해주세요.",
        variant: "destructive",
      })
      return
    }

    setIsAssigning(true)
    try {
      const mainContentEditor = document.getElementById('assign-content')
      const mainContentHtml = mainContentEditor?.innerHTML || ''
      
      const requestBody: any = {
        title: assignForm.title,
        priority: assignForm.priority,
        due_date: assignForm.due_date ? format(assignForm.due_date, "yyyy-MM-dd") : null,
      }
      
      if (subtasks.length > 0) {
        requestBody.mainContent = mainContentHtml
        requestBody.subtasks = subtasks.map(s => ({
          subtitle: s.subtitle,
          assignedToList: s.assignedToList,
          content: s.content,
          fileKeys: s.fileKeys
        }))
        requestBody.assignmentType = 'individual'
        if (s3UpdateId) requestBody.s3_update_id = s3UpdateId
      } else {
        requestBody.content = mainContentHtml
        requestBody.fileKeys = Array.from(selectedFiles)
        requestBody.assignedTo = assignForm.assigned_to
        if (s3UpdateId) requestBody.s3_update_id = s3UpdateId
      }
      
      const response = await fetch("/api/storage/assign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        let errorMessage = "업무 등록 실패"
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
        } catch (e) {
          const errorText = await response.text()
          errorMessage = `HTTP ${response.status}: ${errorText || errorMessage}`
        }
        throw new Error(errorMessage)
      }

      const responseData = await response.json()
      const uniqueAssignees = new Set(subtasks.flatMap(s => s.assignedToList)).size

      if (subtasks.length > 0) {
        toast({
          title: "✅ 공동 업무 등록 완료",
          description: `본인이 책임자가 되었고, ${uniqueAssignees}명에게 공통 과제가 할당되었습니다.`,
          duration: 5000,
        })
      } else {
        toast({
          title: "업무 등록 완료",
          description: "업무가 성공적으로 등록되었습니다.",
          duration: 5000,
        })
      }

      setSelectedFiles(new Set())
      setSubtasks([])
      setSelectedAssignees(new Set())
      setAssignForm({
        title: "",
        content: "",
        priority: "medium",
        description: "",
        due_date: null,
        assigned_to: "",
      })

      const editor = document.getElementById('assign-content')
      if (editor) editor.innerHTML = ''
      const multiEditor = document.getElementById('assign-content-multi')
      if (multiEditor) multiEditor.innerHTML = ''
      return responseData
    } catch (error: any) {
      toast({
        title: "업무 등록 실패",
        description: error.message || "업무 할당 중 오류가 발생했습니다.",
        variant: "destructive",
      })
    } finally {
      setIsAssigning(false)
    }
    return undefined
  }, [assignForm, subtasks, selectedFiles, toast, setAssignForm, setSubtasks, setSelectedAssignees, setSelectedFiles, s3UpdateId])

  return {
    isAssigning,
    handleAssignFiles,
  }
}
