import { useState, useCallback } from 'react'
import { uploadWithProgress } from "@/lib/utils/upload-with-progress"

interface UseFileUploadProps {
  fileType: "excel" | "pdf" | "dicom" | "nifti" | "other"
  isFolderUpload: boolean
  toast: any
  uploadedFile: File | null
  uploadedFiles: File[]
  compressToZip: boolean
  folderPath: string
  folderName: string
  setFolderPath: (path: string) => void
  setFolderName: (name: string) => void
  setAllFolderFiles: (files: File[]) => void
  setUploadedFiles: (files: File[]) => void
  setUploadedFile: (file: File | null) => void
  setUploadProgress: (progress: number) => void
  setFileType: (type: "excel" | "pdf" | "dicom" | "nifti" | "other") => void
  setIsFolderUpload: (value: boolean) => void
  setCompressToZip: (value: boolean) => void
  loadFiles: (force: boolean) => Promise<void>
}

export function useFileUpload(props: UseFileUploadProps) {
  const {
    fileType,
    isFolderUpload,
    toast,
    uploadedFile,
    uploadedFiles,
    compressToZip,
    folderPath,
    folderName,
    setFolderPath,
    setFolderName,
    setAllFolderFiles,
    setUploadedFiles,
    setUploadedFile,
    setUploadProgress,
    setFileType,
    setIsFolderUpload,
    setCompressToZip,
    loadFiles,
  } = props

  const [isUploading, setIsUploading] = useState(false)

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    if (isFolderUpload) {
      const fileArray = Array.from(files)
      const MAX_FOLDER_SIZE = 5 * 1024 * 1024 * 1024
      const totalSize = fileArray.reduce((sum, file) => sum + file.size, 0)
      
      if (totalSize > MAX_FOLDER_SIZE) {
        toast({
          title: "폴더 크기 초과",
          description: `폴더 크기가 5GB를 초과합니다. (현재: ${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB)`,
          variant: "destructive",
        })
        return
      }
      
      setAllFolderFiles(fileArray)
      
      const firstFile = fileArray[0] as any
      if (firstFile.webkitRelativePath) {
        const pathParts = firstFile.webkitRelativePath.split('/')
        if (pathParts.length > 1) {
          const fullPath = pathParts.slice(0, -1).join('/')
          setFolderPath(fullPath)
          setFolderName("")
        }
      }

      const allowedExtensions: Record<string, string[]> = {
        excel: ['xlsx', 'xls', 'csv'],
        pdf: ['pdf'],
        dicom: ['dcm', 'dicom'],
        nifti: ['nii', 'nii.gz', 'nifti'],
        other: [],
      }
      
      const extensions = fileType ? allowedExtensions[fileType] || [] : 
        [...allowedExtensions.excel, ...allowedExtensions.pdf, ...allowedExtensions.dicom]

      const checkFileExtension = (fileName: string, allowedExts: string[]): boolean => {
        if (fileType === 'other') return true
        const fileNameLower = fileName.toLowerCase()
        if (fileNameLower.endsWith('.nii.gz')) return allowedExts.includes('nii.gz')
        const extension = fileName.split('.').pop()?.toLowerCase()
        return extension ? allowedExts.includes(extension) : false
      }

      const filteredFiles = fileArray.filter(file => checkFileExtension(file.name, extensions))
      setUploadedFiles(filteredFiles)
      setUploadedFile(null)
      
      if (filteredFiles.length === 0) {
        toast({
          title: "경고",
          description: `선택한 폴더에 ${fileType} 파일이 없습니다.`,
          variant: "destructive",
        })
        const fileInput = document.getElementById("fileInput") as HTMLInputElement
        if (fileInput) fileInput.value = ""
        setAllFolderFiles([])
        setUploadedFiles([])
        setFolderPath("")
        setFolderName("")
      } else {
        toast({
          title: "폴더 선택됨",
          description: `${filteredFiles.length}개의 ${fileType} 파일이 업로드됩니다`,
        })
      }
    } else {
      const file = files[0]
      setUploadedFile(file)
      setUploadedFiles([])
    }
  }, [fileType, isFolderUpload, toast, setAllFolderFiles, setFolderPath, setFolderName, setUploadedFiles, setUploadedFile])

  const handleUploadSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!uploadedFile && uploadedFiles.length === 0) {
      toast({
        title: "Error",
        description: "파일을 선택해주세요",
        variant: "destructive",
      })
      return
    }

    setIsUploading(true)
    setUploadProgress(0)

    try {
      const formData = new FormData()
      if (isFolderUpload && uploadedFiles.length > 0) {
        if (compressToZip) {
          const JSZip = (await import("jszip")).default
          const zip = new JSZip()
          const fileNamesInZip = new Set<string>()
          
          for (const file of uploadedFiles) {
            const fileWithPath = file as any
            const relativePath = fileWithPath.webkitRelativePath || file.name
            const pathParts = relativePath.split('/')
            let pathWithoutRoot = pathParts.slice(1).join('/') || file.name
            
            if (fileNamesInZip.has(pathWithoutRoot)) {
              const timestamp = Date.now()
              const nameParts = pathWithoutRoot.split('.')
              const ext = nameParts.pop()
              const nameWithoutExt = nameParts.join('.')
              pathWithoutRoot = `${nameWithoutExt}-${timestamp}.${ext || ''}`
            }
            fileNamesInZip.add(pathWithoutRoot)
            zip.file(pathWithoutRoot, file)
          }
          
          const zipBlob = await zip.generateAsync({ type: "blob" })
          const zipFileName = (folderName.trim() || (folderPath ? folderPath.split(/[/\\]/).pop() || "folder" : "folder")) + ".zip"
          const zipFile = new File([zipBlob], zipFileName, { type: "application/zip" })
          formData.append("file", zipFile)
          formData.append("fileType", "zip")
        } else {
          uploadedFiles.forEach(file => formData.append("files", file))
          const folderNameToSend = folderName.trim() || (folderPath ? folderPath.split(/[/\\]/).pop() || folderPath : "")
          formData.append("folderName", folderNameToSend)
        }
      } else if (uploadedFile) {
        formData.append("file", uploadedFile)
        const fileExtension = uploadedFile.name.split('.').pop()?.toLowerCase()
        if (fileExtension === '7z' || fileExtension === 'zip') {
          formData.append("fileType", "zip")
        } else {
          formData.append("fileType", fileType)
        }
      } else {
        formData.append("fileType", fileType)
      }

      const data = await uploadWithProgress<any>({
        url: "/api/storage/upload",
        formData,
        withCredentials: true,
        onProgress: (p) => setUploadProgress(p.percent),
      })

      const fileCount = data.count || (data.fileId ? 1 : 0)
      toast({
        title: "Success",
        description: `${fileCount}개의 파일이 성공적으로 업로드되었습니다.`,
      })

      setUploadedFile(null)
      setUploadedFiles([])
      setAllFolderFiles([])
      setFolderPath("")
      setFolderName("")
      setFileType("excel")
      setIsFolderUpload(false)
      setCompressToZip(false)
      const fileInput = document.getElementById("fileInput") as HTMLInputElement
      if (fileInput) fileInput.value = ""

      await loadFiles(true)
    } catch (error: unknown) {
      console.error("[Upload] Upload error:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "파일 업로드에 실패했습니다",
        variant: "destructive",
      })
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }, [uploadedFile, uploadedFiles, isFolderUpload, compressToZip, folderName, folderPath, fileType, toast, setUploadedFile, setUploadedFiles, setAllFolderFiles, setFolderPath, setFolderName, setFileType, setIsFolderUpload, setCompressToZip, loadFiles, setUploadProgress])

  return {
    isUploading,
    handleFileChange,
    handleUploadSubmit,
  }
}
