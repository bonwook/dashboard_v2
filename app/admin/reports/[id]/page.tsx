"use client"

import { useState, useCallback, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ReportFormSection } from "../components/ReportFormSection"
import { reportFormSections } from "../reportFormFields"
import { DICOM_IMPORTANT_TAGS } from "@/lib/constants/dicomTags"
import { buildPlaceholderFromS3Metadata } from "../s3MetadataToFormMap"
import type { FormValues } from "../types"
import { ArrowLeft, Loader2, Save } from "lucide-react"
import { useParams } from "next/navigation"
import { useToast } from "@/hooks/use-toast"

export default function ReportFormPage() {
  const params = useParams()
  const taskId = params.id as string
  const { toast } = useToast()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [formValues, setFormValues] = useState<FormValues>({})
  const [placeholderFromS3, setPlaceholderFromS3] = useState<Record<string, string | number>>({})
  const [s3MetadataKeyValues, setS3MetadataKeyValues] = useState<Record<string, string | number>>({})
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
    if (sectionId === "s3_metadata") {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const t of DICOM_IMPORTANT_TAGS) {
          const id = "s3_meta_" + t.key
          if (checked) next.add(id)
          else next.delete(id)
        }
        return next
      })
      return
    }
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
      const [reportRes, tasksRes, s3Res] = await Promise.all([
        fetch(`/api/reports/info?task_id=${encodeURIComponent(taskId)}`, { credentials: "include" }),
        fetch("/api/reports", { credentials: "include" }),
        fetch(`/api/s3-updates?task_id=${encodeURIComponent(taskId)}`, { credentials: "include" }),
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
        const task = (listData.reports || []).find((r: { id: string }) => r.id === taskId)
        if (task) setTaskTitle((task as { patient_name?: string; title?: string }).patient_name ?? (task as { title?: string }).title ?? "")
      }
      if (s3Res.ok) {
        const s3Data = await s3Res.json()
        const list = s3Data.s3Updates as { metadata?: Record<string, unknown> | string | null }[] | undefined
        const first = list?.[0]
        if (first?.metadata) {
          try {
            const raw = typeof first.metadata === "string"
              ? (JSON.parse(first.metadata || "{}") as Record<string, unknown>)
              : first.metadata
            const keyValues: Record<string, string | number> = {}
            for (const [k, v] of Object.entries(raw)) {
              if (v !== undefined && v !== null && v !== "")
                keyValues[k] = typeof v === "object" ? JSON.stringify(v) : String(v).trim()
            }
            setS3MetadataKeyValues(keyValues)
            const mapped = buildPlaceholderFromS3Metadata(first.metadata)
            const metaPlaceholders: Record<string, string | number> = {}
            for (const [k, val] of Object.entries(keyValues))
              metaPlaceholders["s3_meta_" + k] = val
            setPlaceholderFromS3({ ...mapped, ...metaPlaceholders })
          } catch {
            // ignore parse error
          }
        }
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [taskId])

  const handleSave = async () => {
    setSaving(true)
    try {
      const dataToSave: FormValues = { ...formValues }
      for (const [fieldId, placeholderValue] of Object.entries(placeholderFromS3)) {
        const current = dataToSave[fieldId]
        if (current === undefined || current === null || current === "")
          dataToSave[fieldId] = placeholderValue
      }
      const res = await fetch("/api/reports/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          task_id: taskId,
          case_id: caseId,
          form_data: dataToSave,
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

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-6 flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/reports">
            <ArrowLeft className="mr-2 h-4 w-4" />
            목록으로
          </Link>
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

      <ReportFormSection
        selectedIds={selectedIds}
        onSelectChange={onSelectChange}
        formValues={formValues}
        onValueChange={onValueChange}
        onSelectAllInSection={onSelectAllInSection}
        placeholderOverrides={placeholderFromS3}
        s3MetadataKeyValues={s3MetadataKeyValues}
      />

      <div className="mt-8 flex justify-center pb-6">
        <Button size="default" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          저장
        </Button>
      </div>
    </div>
  )
}
