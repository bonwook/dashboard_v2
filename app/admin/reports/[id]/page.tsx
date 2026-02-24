"use client"

import { useState, useCallback, useEffect } from "react"
import Link from "next/link"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ReportFormSection } from "../components/ReportFormSection"
import { ExportSection } from "../components/ExportSection"
import { reportFormSections, getFieldLabelById } from "../reportFormFields"
import type { FormValues } from "../types"
import { FileText, FileDown, ArrowLeft, Loader2, Save } from "lucide-react"
import { useParams } from "next/navigation"
import { useToast } from "@/hooks/use-toast"

export default function ReportFormPage() {
  const params = useParams()
  const taskId = params.id as string
  const { toast } = useToast()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [formValues, setFormValues] = useState<FormValues>({})
  const [caseId, setCaseId] = useState<string>(taskId)
  const [taskTitle, setTaskTitle] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const onSelectChange = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const onValueChange = useCallback((id: string, value: string | number | undefined) => {
    setFormValues((prev) => ({ ...prev, [id]: value }))
  }, [])

  const onSelectAllInSection = useCallback((sectionId: string, checked: boolean) => {
    const section = reportFormSections.find((s) => s.id === sectionId)
    if (!section) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const f of section.fields) {
        if (checked) next.add(f.id)
        else next.delete(f.id)
      }
      return next
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [reportRes, tasksRes] = await Promise.all([
        fetch(`/api/reports/info?task_id=${encodeURIComponent(taskId)}`, { credentials: "include" }),
        fetch("/api/reports", { credentials: "include" }),
      ])
      if (cancelled) return
      if (reportRes.ok) {
        const infoData = await reportRes.json()
        if (infoData.row) {
          setFormValues((infoData.row.form_data as FormValues) || {})
          setCaseId(infoData.row.case_id || taskId)
        }
      }
      if (tasksRes.ok) {
        const listData = await tasksRes.json()
        const task = (listData.reports || []).find((r: any) => r.id === taskId)
        if (task) setTaskTitle(task.patient_name ?? task.title ?? "")
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [taskId])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/reports/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          task_id: taskId,
          case_id: caseId,
          form_data: formValues,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || "저장 실패")
      }
      toast({ title: "저장됨", description: "리포트가 저장되었습니다." })
    } catch (e) {
      toast({
        title: "저장 실패",
        description: e instanceof Error ? e.message : "다시 시도해 주세요.",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const selectedIdsOrdered = reportFormSections.flatMap((s) =>
    s.fields.filter((f) => selectedIds.has(f.id)).map((f) => f.id)
  )
  const selectedLabels = selectedIdsOrdered.map(getFieldLabelById)

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-6 flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/reports">
            <ArrowLeft className="mr-2 h-4 w-4" />
            목록으로
          </Link>
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          저장
        </Button>
      </div>

      <div className="mb-4">
        <h1 className="text-xl font-bold">{taskTitle || "의료 리포트 폼"}</h1>
        <p className="text-muted-foreground text-sm mt-0.5 flex items-center gap-4">
          <span>태스크 ID: {taskId}</span>
          <span className="flex items-center gap-2">
            그룹 ID (case_id):
            <Input
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              className="h-8 text-sm w-48"
              placeholder="같은 케이스면 동일 값"
            />
          </span>
        </p>
      </div>

      <Tabs defaultValue="form" className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2 h-9">
          <TabsTrigger value="form" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            리포트 폼
          </TabsTrigger>
          <TabsTrigger value="export" className="flex items-center gap-2">
            <FileDown className="h-4 w-4" />
            내보내기
          </TabsTrigger>
        </TabsList>

        <TabsContent value="form" className="mt-3">
          <ReportFormSection
            selectedIds={selectedIds}
            onSelectChange={onSelectChange}
            formValues={formValues}
            onValueChange={onValueChange}
            onSelectAllInSection={onSelectAllInSection}
          />
        </TabsContent>

        <TabsContent value="export" className="mt-3">
          <ExportSection
            selectedIds={selectedIdsOrdered}
            selectedLabels={selectedLabels}
            formValues={formValues}
            importedData={null}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
