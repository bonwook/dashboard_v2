import { calculateFileExpiry } from "@/lib/utils/dateHelpers"

interface FileListItemProps {
  fileName: string
  s3Key: string
  uploadedAt?: string | null
  fallbackDate: string
  assignedToName?: string
  /** 담당자 구분용 괄호 색상 (Tailwind 클래스, 예: text-blue-600) */
  assigneeColorClass?: string
  onDownload: (s3Key: string, fileName: string) => Promise<void>
}

/**
 * 첨부파일 목록 아이템 컴포넌트
 * 만료된 파일은 클릭 불가능하게 처리
 */
export function FileListItem({
  fileName,
  s3Key,
  uploadedAt,
  fallbackDate,
  assignedToName,
  assigneeColorClass,
  onDownload,
}: FileListItemProps) {
  const expiry = calculateFileExpiry(uploadedAt || fallbackDate)

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={expiry.isExpired}
        className={`text-sm text-left ${
          expiry.isExpired
            ? "text-muted-foreground line-through cursor-not-allowed opacity-50"
            : "text-blue-600 hover:text-blue-800 underline cursor-pointer"
        }`}
        onClick={async () => {
          if (!expiry.isExpired) {
            await onDownload(s3Key, fileName)
          }
        }}
      >
        {fileName}
      </button>
      
      {assignedToName && (
        <span className={assigneeColorClass ? `text-xs font-medium shrink-0 ${assigneeColorClass}` : "text-xs text-muted-foreground shrink-0"}>
          ({assignedToName})
        </span>
      )}
      
      <span
        className={`text-xs shrink-0 ${
          expiry.isExpired
            ? "text-red-500 font-medium"
            : expiry.daysRemaining <= 2
            ? "text-orange-500"
            : "text-muted-foreground"
        }`}
      >
        ({expiry.expiryText})
      </span>
    </div>
  )
}
