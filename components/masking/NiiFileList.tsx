"use client"

import { FileImage, CheckCircle2, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { NiiFileItem } from "./types"

interface NiiFileListProps {
  files: NiiFileItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete?: (id: string) => void
}

export function NiiFileList({ files, selectedId, onSelect, onDelete }: NiiFileListProps) {
  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
        <FileImage className="h-10 w-10 opacity-50" />
        <p className="text-sm">.nii / .nii.gz 파일이 없습니다</p>
      </div>
    )
  }
  return (
    <ul className="space-y-0.5">
      {files.map((file) => (
        <li key={file.id}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelect(file.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onSelect(file.id)
              }
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors select-none cursor-pointer",
              "hover:bg-muted/70",
              selectedId === file.id && "bg-muted",
              file.completed
                ? "border border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "border border-transparent"
            )}
          >
            {file.completed ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
            ) : (
              <FileImage className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate" title={file.name}>
              {file.name}
            </span>
            {onDelete && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(file.id)
                }}
                aria-label="목록에서 삭제"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
