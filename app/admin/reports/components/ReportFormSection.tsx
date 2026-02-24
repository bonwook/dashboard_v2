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
import { cn } from "@/lib/utils"

interface ReportFormSectionProps {
  selectedIds: Set<string>
  onSelectChange: (id: string, checked: boolean) => void
  formValues: FormValues
  onValueChange: (id: string, value: string | number | undefined) => void
  onSelectAllInSection?: (sectionId: string, checked: boolean) => void
}

function FieldInput({
  field,
  value,
  onChange,
  compact,
}: {
  field: ReportField
  value: string | number | undefined
  onChange: (v: string | number | undefined) => void
  compact?: boolean
}) {
  const val = value === undefined || value === null ? "" : String(value)
  const numVal = typeof value === "number" ? value : undefined
  const inputClass = compact ? "h-8 text-sm max-w-[180px]" : "max-w-[200px]"

  if (field.type === "textarea") {
    return (
      <Textarea
        id={field.id}
        placeholder={field.placeholder}
        value={val}
        onChange={(e) => onChange(e.target.value)}
        rows={1}
        className="resize-none text-sm min-h-[60px]"
      />
    )
  }
  if (field.type === "select") {
    return (
      <Select value={val || ""} onValueChange={(v) => onChange(v)}>
        <SelectTrigger id={field.id} className={cn("w-full", compact && "h-8 text-sm max-w-[180px]")}>
          <SelectValue placeholder={field.placeholder || "선택"} />
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
      <div className="flex items-center gap-1.5">
        <Input
          id={field.id}
          type="number"
          min={field.min}
          max={field.max}
          placeholder={field.placeholder}
          value={numVal ?? val}
          onChange={(e) => {
            const v = e.target.value
            if (v === "") onChange(undefined)
            else onChange(Number(v))
          }}
          className={inputClass}
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
        className={inputClass}
      />
    )
  }
  return (
    <Input
      id={field.id}
      type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
      placeholder={field.placeholder}
      value={val}
      onChange={(e) => onChange(e.target.value || undefined)}
      className={compact ? "h-8 text-sm max-w-[180px]" : "max-w-md"}
    />
  )
}

export function ReportFormSection({
  selectedIds,
  onSelectChange,
  formValues,
  onValueChange,
  onSelectAllInSection,
}: ReportFormSectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-xl">의료 리포트 폼</CardTitle>
        <CardDescription className="text-sm">
          포함할 항목을 체크하고 값을 입력하세요. 선택한 필드만 내보내기됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <Accordion type="multiple" defaultValue={["patient_id"]} className="w-full">
          {reportFormSections.map((section) => (
            <AccordionItem key={section.id} value={section.id} className="border-b last:border-b-0">
              <AccordionTrigger className="py-3 text-left text-sm hover:no-underline [&[data-state=open]>svg]:rotate-180">
                <span className="font-medium">{section.title}</span>
                <span className="text-muted-foreground font-normal ml-2">
                  ({section.fields.filter((f) => selectedIds.has(f.id)).length}/{section.fields.length})
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-3 pt-0">
                {onSelectAllInSection && (
                  <div className="flex items-center gap-2 mb-2 py-1.5 px-2 rounded bg-muted/50">
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
                  <p className="text-muted-foreground text-xs mb-2">{section.description}</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                  {section.fields.map((field) => {
                    const isTextarea = field.type === "textarea"
                    return (
                      <div
                        key={field.id}
                        className={cn(
                          "flex gap-2 rounded-md px-2 py-1.5 items-start",
                          isTextarea ? "sm:col-span-2 flex-col" : "items-center",
                          field.identifier && "bg-amber-50/60 dark:bg-amber-950/20"
                        )}
                      >
                        <div className="flex items-center gap-2 shrink-0 min-w-0">
                          <Checkbox
                            id={`chk-${field.id}`}
                            checked={selectedIds.has(field.id)}
                            onCheckedChange={(checked) =>
                              onSelectChange(field.id, checked === true)
                            }
                            className="mt-0.5"
                          />
                          <Label
                            htmlFor={`chk-${field.id}`}
                            className="text-xs font-medium cursor-pointer truncate"
                            title={field.label}
                          >
                            {field.label}
                            {field.identifier && (
                              <span className="text-amber-600 dark:text-amber-400 ml-0.5">*</span>
                            )}
                          </Label>
                        </div>
                        <div className={cn("flex-1 min-w-0", !isTextarea && "flex justify-end sm:justify-start")}>
                          <FieldInput
                            field={field}
                            value={formValues[field.id]}
                            onChange={(v) => onValueChange(field.id, v)}
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
