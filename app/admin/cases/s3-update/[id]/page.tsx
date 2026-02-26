"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2 } from "lucide-react"
import { S3BucketInfoCard } from "@/components/s3-bucket-info-card"

interface S3Update {
  id: number
  file_name: string
  bucket_name?: string | null
  file_size?: number | null
  metadata?: Record<string, unknown> | string | null
  upload_time?: string | null
  created_at: string
  task_id: string | null
  status?: string
  s3_key: string
}

export default function S3UpdateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [s3Update, setS3Update] = useState<S3Update | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [id, setId] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    params.then((p) => setId(p.id))
  }, [params])

  useEffect(() => {
    if (!id) return
    const load = async () => {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/s3-updates/${id}`, { credentials: "include" })
        if (!res.ok) {
          if (res.status === 404) {
            router.push("/admin/cases")
            return
          }
          throw new Error("Failed to load")
        }
        const data = await res.json()
        setS3Update(data.s3Update as S3Update)
      } catch {
        router.push("/admin/cases")
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id, router])

  if (isLoading || !s3Update) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          뒤로가기
        </Button>
      </div>

      <S3BucketInfoCard s3Update={{ ...s3Update, s3_key: s3Update.s3_key }} />
    </div>
  )
}
