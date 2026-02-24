import { FileSpreadsheet, FileText, FileImage, type LucideIcon } from "lucide-react"
import { S3File } from '../types'

export const getFileType = (file: S3File | null | undefined): "excel" | "pdf" | "dicom" | "image" | "video" | "ppt" | "other" => {
  if (!file) return "other"
  
  const fileName = file.fileName || file.key
  if (!fileName) return "other"
  
  const extension = fileName.toLowerCase().split('.').pop()
  if (!extension) return "other"
  
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg']
  if (extension && imageExtensions.includes(extension)) return "image"
  
  const videoExtensions = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v']
  if (extension && videoExtensions.includes(extension)) return "video"
  
  const pptExtensions = ['ppt', 'pptx']
  if (extension && pptExtensions.includes(extension)) return "ppt"
  
  if (file.fileType) {
    if (file.fileType === "excel") return "excel"
    if (file.fileType === "pdf") return "pdf"
    if (file.fileType === "dicom") return "dicom"
  }
  
  if (file.key && file.key.includes("/excel/")) return "excel"
  if (file.key && file.key.includes("/pdf/")) return "pdf"
  if (file.key && file.key.includes("/dicom/")) return "dicom"
  return "other"
}

export const getFileTypeIcon = (file: S3File): LucideIcon => {
  const type = getFileType(file)
  return (
    type === "excel" ? FileSpreadsheet :
    type === "pdf" ? FileText :
    (type === "dicom" || type === "image") ? FileImage :
    FileText
  )
}

export const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + " B"
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB"
  return (bytes / (1024 * 1024)).toFixed(2) + " MB"
}

export const updateDisplayedFiles = (fileList: S3File[], path: string, setFiles: (files: S3File[]) => void) => {
  const folders = new Set<string>()
  const filesInFolder: S3File[] = []

  fileList.forEach(file => {
    if (!file.folderPath) {
      if (!path) filesInFolder.push(file)
    } else {
      if (!path) {
        const folderParts = file.folderPath.split('/')
        if (folderParts.length >= 2) {
          const firstFolder = folderParts.slice(0, 2).join('/')
          folders.add(firstFolder)
        } else if (folderParts.length === 1) {
          filesInFolder.push(file)
        } else {
          filesInFolder.push(file)
        }
      } else {
        if (file.folderPath === path) {
          filesInFolder.push(file)
        } else if (file.folderPath.startsWith(path + '/')) {
          const relativePath = file.folderPath.substring(path.length + 1)
          const relativeParts = relativePath.split('/')
          
          if (relativeParts.length > 0) {
            const firstPart = relativeParts[0]
            const subFolderPath = `${path}/${firstPart}`
            folders.add(subFolderPath)
          }
        }
      }
    }
  })

  const folderItems: S3File[] = Array.from(folders).map(folderPath => {
    const folderName = folderPath.split('/').pop() || folderPath
    return {
      key: folderPath,
      size: 0,
      lastModified: new Date(),
      fileName: folderName,
      fileType: 'folder' as any,
      folderPath: path,
    }
  })

  const sorted = [...folderItems, ...filesInFolder].sort((a, b) => {
    if (a.fileType === 'folder' && b.fileType !== 'folder') return -1
    if (a.fileType !== 'folder' && b.fileType === 'folder') return 1
    return (a.fileName || '').localeCompare(b.fileName || '')
  })

  setFiles(sorted)
}

export const getDisplayPath = (path: string): string => {
  if (!path) return ''
  const pathParts = path.split('/')
  if (pathParts.length > 1) return pathParts.slice(1).join('/')
  return ''
}
