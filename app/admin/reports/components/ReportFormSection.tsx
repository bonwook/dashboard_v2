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
  const inputClass = compact ? "h-8 text-sm w-full" : "max-w-[200px]"

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
        <SelectTrigger id={field.id} className={cn("w-full", compact && "h-8 text-sm")}>
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
      className={compact ? "h-8 text-sm w-full" : "max-w-md"}
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
    <Card className="border-0 shadow-sm bg-card">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-semibold">의료 리포트 폼</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          포함할 항목을 체크하고 값을 입력하세요.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <Accordion type="multiple" defaultValue={reportFormSections.map((s) => s.id)} className="w-full space-y-1">
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-6">
                  {section.fields.map((field) => {
                    const isTextarea = field.type === "textarea"
                    return (
                      <div
                        key={field.id}
                        className={cn(
                          "flex flex-col sm:flex-row sm:items-center gap-2 rounded-md py-2 px-3 min-w-0",
                          isTextarea && "md:col-span-2",
                          field.identifier && "bg-amber-50/60 dark:bg-amber-950/20"
                        )}
                      >
                        <div className="flex items-center gap-2 shrink-0 min-w-[140px] sm:min-w-[180px]">
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
                            className="text-sm font-medium cursor-pointer wrap-break-word"
                            title={field.label}
                          >
                            {field.label}
                            {field.identifier && (
                              <span className="text-amber-600 dark:text-amber-400 ml-0.5">*</span>
                            )}
                          </Label>
                        </div>
                        <div className={cn("flex-1 min-w-0 sm:max-w-[240px]", isTextarea && "sm:max-w-none")}>
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
