export type DownloadProgress = {
  percent: number
  loaded: number
  total: number
}

type DownloadWithProgressOptions = {
  url: string
  fileName: string
  withCredentials?: boolean
  onProgress?: (p: DownloadProgress) => void
}

export async function downloadWithProgress({
  url,
  fileName,
  withCredentials = true,
  onProgress,
}: DownloadWithProgressOptions): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("GET", url, true)
    xhr.responseType = "blob"
    xhr.withCredentials = withCredentials

    let totalFromHeader: number | null = null
    xhr.onreadystatechange = () => {
      // HEADERS_RECEIVED
      if (xhr.readyState === 2) {
        const len = xhr.getResponseHeader("content-length")
        const parsed = len ? Number(len) : NaN
        totalFromHeader = Number.isFinite(parsed) && parsed > 0 ? parsed : null
      }
    }

    xhr.onprogress = (evt) => {
      const total = evt.lengthComputable ? evt.total : totalFromHeader || 0
      if (!total) return
      const percent = Math.max(0, Math.min(100, Math.round((evt.loaded / total) * 100)))
      onProgress?.({ percent, loaded: evt.loaded, total })
    }

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`다운로드 실패 (HTTP ${xhr.status})`))
        return
      }

      const blob = xhr.response as Blob
      const objectUrl = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = objectUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(objectUrl)
      resolve()
    }

    xhr.onerror = () => reject(new Error("네트워크 오류로 다운로드에 실패했습니다."))
    xhr.onabort = () => reject(new Error("다운로드가 취소되었습니다."))

    try {
      xhr.send()
    } catch (e: any) {
      reject(new Error(e?.message || "다운로드에 실패했습니다."))
    }
  })
}

