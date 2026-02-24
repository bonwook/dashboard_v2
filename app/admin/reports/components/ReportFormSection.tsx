"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { reportFormSections } from "../reportFormFields"
import type { ReportField, FormValues } from "../types"
import { DICOM_IMPORTANT_TAGS } from "@/lib/constants/dicomTags"
import { cn } from "@/lib/utils"

interface ReportFormSectionProps {
  selectedIds: Set<string>
  onSelectChange: (id: string, checked: boolean) => void
  formValues: FormValues
  onValueChange: (id: string, value: string | number | undefined) => void
  onSelectAllInSection?: (sectionId: string, checked: boolean) => void
  /** S3 metadata 기반 placeholder (수정 없으면 저장 시 이 값으로 저장) */
  placeholderOverrides?: Record<string, string | number>
  /** S3 메타데이터 원본 key-value (폼 행으로 표시, placeholder로 값 사용) */
  s3MetadataKeyValues?: Record<string, string | number>
}

const INPUT_BOX_CLASS = "h-9 text-sm w-full min-w-0 max-w-[280px]"

function FieldInput({
  field,
  value,
  onChange,
  placeholderOverride,
  compact,
}: {
  field: ReportField
  value: string | number | undefined
  onChange: (v: string | number | undefined) => void
  placeholderOverride?: string | number
  compact?: boolean
}) {
  const val = value === undefined || value === null ? "" : String(value)
  const numVal = typeof value === "number" ? value : undefined
  const placeholder = placeholderOverride !== undefined && placeholderOverride !== null && placeholderOverride !== ""
    ? String(placeholderOverride)
    : field.placeholder

  if (field.type === "textarea") {
    return (
      <Textarea
        id={field.id}
        placeholder={placeholder}
        value={val}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="resize-none text-sm min-h-[64px] w-full max-w-[480px]"
      />
    )
  }
  if (field.type === "select") {
    return (
      <Select value={val || ""} onValueChange={(v) => onChange(v)}>
        <SelectTrigger id={field.id} className={cn(INPUT_BOX_CLASS, compact && "h-9 text-sm")}>
          <SelectValue placeholder={placeholder || "선택"} />
        </SelectTrigger>
        <SelectContent>
          {(field.options || []).map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  if (field.type === "number") {
    return (
      <div className="flex items-center gap-1.5 w-full max-w-[280px]">
        <Input
          id={field.id}
          type="number"
          min={field.min}
          max={field.max}
          placeholder={placeholder}
          value={numVal ?? val}
          onChange={(e) => {
            const v = e.target.value
            if (v === "") onChange(undefined)
            else onChange(Number(v))
          }}
          className={INPUT_BOX_CLASS}
        />
        {field.unit && (
          <span className="text-muted-foreground text-xs shrink-0">{field.unit}</span>
        )}
      </div>
    )
  }
  if (field.type === "date") {
    return (
      <Input
        id={field.id}
        type="date"
        value={val}
        onChange={(e) => onChange(e.target.value || undefined)}
        className={INPUT_BOX_CLASS}
      />
    )
  }
  return (
    <Input
      id={field.id}
      type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
      placeholder={placeholder}
      value={val}
      onChange={(e) => onChange(e.target.value || undefined)}
      className={INPUT_BOX_CLASS}
    />
  )
}

const S3_META_PREFIX = "s3_meta_"

export function ReportFormSection({
  selectedIds,
  onSelectChange,
  formValues,
  onValueChange,
  onSelectAllInSection,
  placeholderOverrides,
  s3MetadataKeyValues = {},
}: ReportFormSectionProps) {
  const defaultAccordionValues = ["s3_metadata", ...reportFormSections.map((s) => s.id)]

  return (
    <Card className="border-0 shadow-sm bg-card">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-semibold">의료 리포트 폼</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          포함할 항목을 체크하고 값을 입력하세요. (S3 메타데이터가 있으면 placeholder로 표시되며, 수정 없이 저장 시 자동 입력됩니다.)
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <Accordion type="multiple" defaultValue={defaultAccordionValues} className="w-full space-y-1">
          <AccordionItem
            value="s3_metadata"
            className="border rounded-lg px-4 mb-2 last:mb-0 data-[state=open]:bg-muted/30"
          >
            <AccordionTrigger className="py-3 text-left hover:no-underline [&[data-state=open]>svg]:rotate-180">
              <span className="font-medium text-sm">S3 메타데이터</span>
              <span className="text-muted-foreground font-normal ml-2 text-xs">
                ({DICOM_IMPORTANT_TAGS.filter((t) => selectedIds.has(S3_META_PREFIX + t.key)).length}/{DICOM_IMPORTANT_TAGS.length})
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-4 pt-0">
              {onSelectAllInSection && (
                <div className="flex items-center gap-2 mb-3 py-2 px-3 rounded-md bg-muted/50 w-fit">
                  <Checkbox
                    id="section-all-s3_metadata"
                    checked={DICOM_IMPORTANT_TAGS.every((t) => selectedIds.has(S3_META_PREFIX + t.key))}
                    onCheckedChange={(checked) => onSelectAllInSection("s3_metadata", checked === true)}
                  />
                  <Label htmlFor="section-all-s3_metadata" className="text-xs cursor-pointer">
                    섹션 전체 선택
                  </Label>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-2 gap-x-8">
                {DICOM_IMPORTANT_TAGS.map((tag) => {
                  const fieldId = S3_META_PREFIX + tag.key
                  const placeholder = placeholderOverrides?.[fieldId] ?? s3MetadataKeyValues[tag.key]
                  return (
                    <div
                      key={fieldId}
                      className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-md py-2.5 px-3 min-w-0 min-h-[52px] sm:min-h-[44px] border border-transparent hover:border-muted/50"
                    >
                      <div className="flex items-center gap-2 shrink-0 w-full sm:w-[200px] min-w-0">
                        <Checkbox
                          id={`chk-${fieldId}`}
                          checked={selectedIds.has(fieldId)}
                          onCheckedChange={(checked) => onSelectChange(fieldId, checked === true)}
                          className="mt-0.5 shrink-0"
                        />
                        <Label
                          htmlFor={`chk-${fieldId}`}
                          className="text-sm font-medium cursor-pointer wrap-break-word line-clamp-2"
                          title={tag.name}
                        >
                          {tag.name}
                        </Label>
                      </div>
                      <div className="flex-1 min-w-0 w-full sm:max-w-[300px]">
                        <Input
                          id={fieldId}
                          type="text"
                          placeholder={placeholder !== undefined && placeholder !== null && placeholder !== "" ? String(placeholder) : ""}
                          value={formValues[fieldId] === undefined || formValues[fieldId] === null ? "" : String(formValues[fieldId])}
                          onChange={(e) => onValueChange(fieldId, e.target.value || undefined)}
                          className={INPUT_BOX_CLASS}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
          {reportFormSections.map((section) => (
            <AccordionItem
              key={section.id}
              value={section.id}
              className="border rounded-lg px-4 mb-2 last:mb-0 data-[state=open]:bg-muted/30"
            >
              <AccordionTrigger className="py-3 text-left hover:no-underline [&[data-state=open]>svg]:rotate-180">
                <span className="font-medium text-sm">{section.title}</span>
                <span className="text-muted-foreground font-normal ml-2 text-xs">
                  ({section.fields.filter((f) => selectedIds.has(f.id)).length}/{section.fields.length})
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4 pt-0">
                {onSelectAllInSection && (
                  <div className="flex items-center gap-2 mb-3 py-2 px-3 rounded-md bg-muted/50 w-fit">
                    <Checkbox
                      id={`section-all-${section.id}`}
                      checked={section.fields.every((f) => selectedIds.has(f.id))}
                      onCheckedChange={(checked) =>
                        onSelectAllInSection(section.id, checked === true)
                      }
                    />
                    <Label htmlFor={`section-all-${section.id}`} className="text-xs cursor-pointer">
                      섹션 전체 선택
                    </Label>
                  </div>
                )}
                {section.description && (
                  <p className="text-muted-foreground text-xs mb-3">{section.description}</p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-2 gap-x-8">
                  {section.fields.map((field) => {
                    const isTextarea = field.type === "textarea"
                    return (
                      <div
                        key={field.id}
                        className={cn(
                          "flex flex-col sm:flex-row sm:items-center gap-2 rounded-md py-2.5 px-3 min-w-0 min-h-[52px] sm:min-h-[44px] border border-transparent hover:border-muted/50",
                          isTextarea && "md:col-span-2 min-h-[80px] sm:min-h-[88px]"
                        )}
                      >
                        <div className="flex items-center gap-2 shrink-0 w-full sm:w-[200px] min-w-0">
                          <Checkbox
                            id={`chk-${field.id}`}
                            checked={selectedIds.has(field.id)}
                            onCheckedChange={(checked) =>
                              onSelectChange(field.id, checked === true)
                            }
                            className="mt-0.5 shrink-0"
                          />
                          <Label
                            htmlFor={`chk-${field.id}`}
                            className="text-sm font-medium cursor-pointer wrap-break-word line-clamp-2"
                            title={field.label}
                          >
                            {field.label}
                            {field.identifier && (
                              <span className="text-muted-foreground ml-0.5">*</span>
                            )}
                          </Label>
                        </div>
                        <div className={cn("flex-1 min-w-0 w-full sm:max-w-[300px]", isTextarea && "sm:max-w-[480px]")}>
                          <FieldInput
                            field={field}
                            value={formValues[field.id]}
                            onChange={(v) => onValueChange(field.id, v)}
                            placeholderOverride={placeholderOverrides?.[field.id]}
                            compact
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  )
}
