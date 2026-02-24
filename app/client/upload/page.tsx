"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { Upload, HardDrive } from "lucide-react"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart"
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts"
import { Progress } from "@/components/ui/progress"
import { uploadWithProgress } from "@/lib/utils/upload-with-progress"

export default function ClientUploadPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [allFolderFiles, setAllFolderFiles] = useState<File[]>([]) // 폴더의 모든 파일 (필터링 전)
  const [folderPath, setFolderPath] = useState<string>("")
  const [folderName, setFolderName] = useState<string>("")
  const [isFolderUpload, setIsFolderUpload] = useState(false)
  const [fileType, setFileType] = useState<"excel" | "pdf" | "dicom" | "nifti" | "other">("excel")
  const [user, setUser] = useState<any>(null)
  const [storageStats, setStorageStats] = useState({
    excel: 0,
    pdf: 0,
    zip: 0,
    dicom: 0,
    nifti: 0,
    other: 0,
  })
  const { toast } = useToast()

  useEffect(() => {
    const loadUser = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" })
        if (!res.ok) return
        const me = await res.json()
        setUser(me)
      } catch {
        // ignore
      }
    }
    loadUser()

    // Load storage stats
    const loadStorageStats = async () => {
      try {
        const storageStatsRes = await fetch("/api/storage/stats", {
          credentials: "include",
        })
        if (storageStatsRes.ok) {
          const storageStatsData = await storageStatsRes.json()
          setStorageStats(storageStatsData.stats || { excel: 0, pdf: 0, zip: 0, dicom: 0, nifti: 0, other: 0 })
        }
      } catch (error) {
        // Silent error handling
      }
    }
    loadStorageStats()
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    if (isFolderUpload) {
      // 폴더 업로드 처리
      const fileArray = Array.from(files)
      
      // 폴더 크기 제한 체크 (5GB = 5 * 1024 * 1024 * 1024 bytes)
      const MAX_FOLDER_SIZE = 5 * 1024 * 1024 * 1024 // 5GB
      const totalSize = fileArray.reduce((sum, file) => sum + file.size, 0)
      
      if (totalSize > MAX_FOLDER_SIZE) {
        toast({
          title: "폴더 크기 초과",
          description: `폴더 크기가 5GB를 초과합니다. (현재: ${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB)`,
          variant: "destructive",
        })
        return
      }
      
      // 모든 파일을 먼저 저장 (표시용)
      setAllFolderFiles(fileArray)
      
      // 폴더 경로 추출 (첫 번째 파일의 webkitRelativePath에서)
      const firstFile = fileArray[0] as any
      if (firstFile.webkitRelativePath) {
        const pathParts = typeof firstFile.webkitRelativePath === 'string' ? 
          firstFile.webkitRelativePath.split('/') : 
          []
        if (pathParts.length > 1) {
          // 전체 경로 표시 (예: "폴더명" 또는 "상위폴더/하위폴더")
          const fullPath = pathParts.slice(0, -1).join('/') // 마지막 파일명 제외한 경로
          setFolderPath(fullPath)
          // 폴더 이름은 사용자가 선택적으로 입력할 수 있도록 빈 문자열로 초기화
          setFolderName("")
        }
      }

      // 필터링은 업로드 시에만 수행 (표시는 모든 파일)
      const allowedExtensions: Record<string, string[]> = {
        excel: ['xlsx', 'xls', 'csv'],
        pdf: ['pdf'],
        dicom: ['dcm', 'dicom'],
        nifti: ['nii', 'nii.gz', 'nifti'],
        other: [], // 기타는 모든 파일 허용
      }
      
      const extensions = fileType ? allowedExtensions[fileType] || [] : 
        [...allowedExtensions.excel, ...allowedExtensions.pdf, ...allowedExtensions.dicom]

      // 파일 확장자로 파일 타입 확인하는 헬퍼 함수
      const detectFileType = (fileName: string): string | null => {
        const fileNameLower = fileName.toLowerCase()
        const extension = fileNameLower.split('.').pop()
        
        if (!extension) return null
        
        // .nii.gz 같은 경우 먼저 체크
        if (fileNameLower.endsWith('.nii.gz')) {
          return 'nifti'
        }
        
        // 기존 파일 타입 확장자 확인
        if (['xlsx', 'xls', 'csv'].includes(extension)) {
          return 'excel'
        } else if (extension === 'pdf') {
          return 'pdf'
        } else if (['dcm', 'dicom'].includes(extension)) {
          return 'dicom'
        } else if (['nii', 'nifti'].includes(extension)) {
          return 'nifti'
        }
        
        return null
      }

      // 파일 확장자 체크 헬퍼 함수 (.nii.gz 같은 경우 처리)
      const checkFileExtension = (fileName: string, allowedExts: string[]): boolean => {
        // 기타 타입은 기존 타입에 해당하지 않는 파일만 허용
        if (fileType === 'other') {
          // 기존 타입에 해당하는 파일이면 false 반환 (업로드 불가)
          return detectFileType(fileName) === null
        }
        const fileNameLower = fileName.toLowerCase()
        // .nii.gz 같은 경우를 먼저 체크
        if (fileNameLower.endsWith('.nii.gz')) {
          return allowedExts.includes('nii.gz')
        }
        const extension = fileName.split('.').pop()?.toLowerCase()
        return extension ? allowedExts.includes(extension) : false
      }

      // 필터링된 파일 (업로드될 파일)
      const filteredFiles = fileArray.filter(file => {
        return checkFileExtension(file.name, extensions)
      })

      // 기타 타입 선택 시 기존 확장자 파일이 있는지 확인
      if (fileType === 'other') {
        const existingTypeFiles = fileArray.filter(file => {
          return detectFileType(file.name) !== null
        })
        
        if (existingTypeFiles.length > 0) {
          const typeNames: Record<string, string> = {
            excel: 'Excel (.xlsx, .xls, .csv)',
            pdf: 'PDF (.pdf)',
            dicom: 'DICOM (.dcm, .dicom)',
            nifti: 'NIFTI (.nii, .nii.gz, .nifti)',
          }
          
          // 첫 번째 파일의 타입으로 안내
          const firstFileType = detectFileType(existingTypeFiles[0].name)
          const typeName = firstFileType ? typeNames[firstFileType] || firstFileType : '알 수 없음'
          const fileNames = existingTypeFiles.slice(0, 5).map(f => f.name).join("\n- ")
          const moreCount = existingTypeFiles.length > 5 ? `\n... 외 ${existingTypeFiles.length - 5}개 파일` : ""
          
          // Alert 팝업 표시
          alert(`파일 타입 재선택 필요\n\n폴더 내에 "${typeName}" 타입에 해당하는 파일이 있습니다:\n- ${fileNames}${moreCount}\n\n파일 타입을 "${typeName}"으로 변경해주세요.`)
          
          toast({
            title: "파일 타입 재선택 필요",
            description: `폴더 내에 "${typeName}" 타입 파일이 ${existingTypeFiles.length}개 있습니다. 파일 타입을 변경해주세요.`,
            variant: "destructive",
          })
          
          // 파일 입력 초기화
          const fileInput = document.getElementById("fileInput") as HTMLInputElement
          if (fileInput) {
            fileInput.value = ""
          }
          setAllFolderFiles([])
          setUploadedFiles([])
          setFolderPath("")
          setFolderName("")
          return
        }
      }

      // 폴더 내에 선택한 파일타입과 다른 파일이 있는지 확인
      const invalidFiles = fileType === 'other' ? [] : fileArray.filter(file => {
        if (!checkFileExtension(file.name, extensions)) {
          return true // 확장자가 없거나 허용되지 않은 확장자면 오류
        }
        return false
      })

      // 다른 파일타입이 있으면 오류 발생 (기타 타입은 체크하지 않음)
      if (fileType !== 'other' && invalidFiles.length > 0) {
        const invalidFileNames = invalidFiles.slice(0, 5).map(f => f.name).join("\n- ")
        const moreCount = invalidFiles.length > 5 ? `\n... 외 ${invalidFiles.length - 5}개 파일` : ""
        const fileTypeName = fileType === "excel" ? "Excel (.xlsx, .xls, .csv)" : fileType === "pdf" ? "PDF (.pdf)" : fileType === "dicom" ? "DICOM (.dcm, .dicom)" : "NIFTI (.nii, .nii.gz, .nifti)"
        
        // Alert 팝업 표시
        alert(`파일 타입 불일치 오류\n\n선택한 파일 타입: ${fileTypeName}\n\n폴더 내에 선택한 파일 타입과 일치하지 않는 파일이 있습니다:\n- ${invalidFileNames}${moreCount}\n\n폴더 내 모든 파일은 선택한 파일 타입과 일치해야 합니다.`)
        
        toast({
          title: "파일 타입 불일치",
          description: `선택한 파일 타입(${fileType})과 일치하지 않는 파일이 ${invalidFiles.length}개 있습니다. 폴더 내 모든 파일은 선택한 파일 타입과 일치해야 합니다.`,
          variant: "destructive",
        })
        // 파일 입력 초기화
        const fileInput = document.getElementById("fileInput") as HTMLInputElement
        if (fileInput) {
          fileInput.value = ""
        }
        setAllFolderFiles([])
        setUploadedFiles([])
        setFolderPath("")
        setFolderName("")
        return
      }

      setUploadedFiles(filteredFiles) // 업로드될 파일
      setUploadedFile(null)
      
      if (filteredFiles.length === 0) {
        toast({
          title: "경고",
          description: `선택한 폴더에 ${fileType} 파일이 없습니다.`,
          variant: "destructive",
        })
        // 파일 입력 초기화
        const fileInput = document.getElementById("fileInput") as HTMLInputElement
        if (fileInput) {
          fileInput.value = ""
        }
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
      // 개별 파일 업로드 처리
      const file = files[0]
      
      // 기타 타입 선택 시 기존 확장자 파일인지 확인
      if (fileType === 'other') {
        // 파일 확장자로 파일 타입 확인
        const detectFileType = (fileName: string): string | null => {
          const fileNameLower = fileName.toLowerCase()
          const extension = fileNameLower.split('.').pop()
          
          if (!extension) return null
          
          // .nii.gz 같은 경우 먼저 체크
          if (fileNameLower.endsWith('.nii.gz')) {
            return 'nifti'
          }
          
          // 기존 파일 타입 확장자 확인
          if (['xlsx', 'xls', 'csv'].includes(extension)) {
            return 'excel'
          } else if (extension === 'pdf') {
            return 'pdf'
          } else if (['dcm', 'dicom'].includes(extension)) {
            return 'dicom'
          } else if (['nii', 'nifti'].includes(extension)) {
            return 'nifti'
          }
          
          return null
        }
        
        const detectedType = detectFileType(file.name)
        if (detectedType) {
          const typeNames: Record<string, string> = {
            excel: 'Excel (.xlsx, .xls, .csv)',
            pdf: 'PDF (.pdf)',
            dicom: 'DICOM (.dcm, .dicom)',
            nifti: 'NIFTI (.nii, .nii.gz, .nifti)',
          }
          
          const typeName = typeNames[detectedType] || detectedType
          
          // Alert 팝업 표시
          alert(`파일 타입 재선택 필요\n\n선택한 파일: ${file.name}\n\n이 파일은 "${typeName}" 타입에 해당합니다.\n파일 타입을 "${typeName}"으로 변경해주세요.`)
          
          toast({
            title: "파일 타입 재선택 필요",
            description: `이 파일은 "${typeName}" 타입입니다. 파일 타입을 변경해주세요.`,
            variant: "destructive",
          })
          
          // 파일 입력 초기화
          const fileInput = document.getElementById("fileInput") as HTMLInputElement
          if (fileInput) {
            fileInput.value = ""
          }
          return
        }
        
        // 기존 타입에 해당하지 않으면 업로드 허용
        setUploadedFile(file)
        setUploadedFiles([])
        return
      }
      
      // 파일 타입에 따라 확장자 확인 (선택한 파일타입과 다른 경우 오류)
      const allowedExtensions: Record<string, string[]> = {
        excel: ['xlsx', 'xls', 'csv'],
        pdf: ['pdf'],
        dicom: ['dcm', 'dicom'],
        nifti: ['nii', 'nii.gz', 'nifti'],
      }
      
      const extensions = allowedExtensions[fileType] || []
      const fileTypeName = fileType === "excel" ? "Excel (.xlsx, .xls, .csv)" : fileType === "pdf" ? "PDF (.pdf)" : fileType === "dicom" ? "DICOM (.dcm, .dicom)" : "NIFTI (.nii, .nii.gz, .nifti)"
      
      // 파일 확장자 체크 헬퍼 함수
      const checkFileExtension = (fileName: string, allowedExts: string[]): boolean => {
        const fileNameLower = fileName.toLowerCase()
        if (fileNameLower.endsWith('.nii.gz')) {
          return allowedExts.includes('nii.gz')
        }
        const extension = fileName.split('.').pop()?.toLowerCase()
        // 7z 파일은 zip 타입으로 자동 처리되므로 허용
        if (extension === '7z' || extension === 'zip') {
          return true
        }
        return extension ? allowedExts.includes(extension) : false
      }
      
      // 7z나 zip 파일은 자동으로 zip 타입으로 처리되므로 허용
      const fileExtension = file.name.split('.').pop()?.toLowerCase()
      if (fileExtension === '7z' || fileExtension === 'zip') {
        // 7z나 zip 파일은 그대로 업로드 (백엔드에서 zip 타입으로 처리)
        setUploadedFile(file)
        setUploadedFiles([])
        return
      }
      
      if (!checkFileExtension(file.name, extensions)) {
        // Alert 팝업 표시
        alert(`파일 타입 불일치 오류\n\n선택한 파일 타입: ${fileTypeName}\n선택한 파일: ${file.name}\n\n선택한 파일이 선택한 파일 타입과 일치하지 않습니다.\n${fileTypeName} 파일만 업로드 가능합니다.`)
        
        toast({
          title: "파일 타입 불일치",
          description: `선택한 파일 타입(${fileType})과 일치하지 않습니다. ${fileTypeName} 파일만 업로드 가능합니다.`,
          variant: "destructive",
        })
        // 파일 입력 초기화
        const fileInput = document.getElementById("fileInput") as HTMLInputElement
        if (fileInput) {
          fileInput.value = ""
        }
        return
      }
      
      // 파일 타입별 크기 제한 검증 (클라이언트 업로드/첨부: 500MB)
      const MAX_FILE_SIZES: Record<string, number> = {
        excel: 500 * 1024 * 1024, // 500MB
        pdf: 500 * 1024 * 1024, // 500MB
        dicom: 500 * 1024 * 1024, // 500MB
        nifti: 500 * 1024 * 1024, // 500MB
        other: 500 * 1024 * 1024, // 500MB
      }
      
      const maxSize = MAX_FILE_SIZES[fileType] || 500 * 1024 * 1024 // 기본값 500MB
      
      if (file.size > maxSize) {
        const maxSizeMB = (maxSize / 1024 / 1024).toFixed(0)
        const currentSizeMB = (file.size / 1024 / 1024).toFixed(2)
        
        alert(`파일 크기 초과 오류\n\n선택한 파일 타입: ${fileTypeName}\n최대 업로드 크기: 500MB\n현재 파일 크기: ${currentSizeMB}MB\n\n파일 크기가 제한을 초과하여 업로드할 수 없습니다.`)
        
        toast({
          title: "파일 크기 초과",
          description: `${fileTypeName} 파일은 최대 500MB까지 업로드 가능합니다. (현재: ${currentSizeMB}MB)`,
          variant: "destructive",
        })
        // 파일 입력 초기화
        const fileInput = document.getElementById("fileInput") as HTMLInputElement
        if (fileInput) {
          fileInput.value = ""
        }
        return
      }
      
      setUploadedFile(file)
      setUploadedFiles([])
    }
  }

  const handleClear = () => {
    setUploadedFile(null)
    setUploadedFiles([])
    setAllFolderFiles([])
    setFolderPath("")
    setFolderName("")
    setFileType("excel")
    setIsFolderUpload(false)
    // Reset file input
    const fileInput = document.getElementById("fileInput") as HTMLInputElement
    if (fileInput) {
      fileInput.value = ""
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!uploadedFile && uploadedFiles.length === 0) {
      toast({
        title: "Error",
        description: "파일을 선택해주세요",
        variant: "destructive",
      })
      return
    }

    // 폴더 업로드 시 크기 제한 재확인
    if (isFolderUpload && uploadedFiles.length > 0) {
      // 파일 타입별 폴더 크기 제한
      const MAX_FOLDER_SIZES: Record<string, number> = {
        excel: 5 * 1024 * 1024 * 1024, // 5GB
        pdf: 5 * 1024 * 1024 * 1024, // 5GB
        dicom: 5 * 1024 * 1024 * 1024, // 5GB
        nifti: 5 * 1024 * 1024 * 1024, // 5GB
        other: 5 * 1024 * 1024 * 1024, // 5GB
      }
      
      const MAX_FOLDER_SIZE = MAX_FOLDER_SIZES[fileType] || 5 * 1024 * 1024 * 1024 // 기본값 5GB
      const totalSize = uploadedFiles.reduce((sum, file) => sum + file.size, 0)
      
      if (totalSize > MAX_FOLDER_SIZE) {
        toast({
          title: "폴더 크기 초과",
          description: `업로드할 파일의 총 크기가 ${(MAX_FOLDER_SIZE / 1024 / 1024 / 1024).toFixed(0)}GB를 초과합니다. (현재: ${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB)`,
          variant: "destructive",
        })
        return
      }
      
      // 폴더 내 개별 파일 크기 제한도 확인
      const MAX_FILE_SIZES: Record<string, number> = {
        excel: 50 * 1024 * 1024, // 50MB
        pdf: 500 * 1024 * 1024, // 500MB
        dicom: 100 * 1024 * 1024, // 100MB
        nifti: 500 * 1024 * 1024, // 500MB
        other: 500 * 1024 * 1024, // 500MB
      }
      
      const maxFileSize = MAX_FILE_SIZES[fileType] || 500 * 1024 * 1024
      const oversizedFiles = uploadedFiles.filter(file => file.size > maxFileSize)
      
      if (oversizedFiles.length > 0) {
        const maxSizeMB = (maxFileSize / 1024 / 1024).toFixed(0)
        const oversizedFileNames = oversizedFiles.slice(0, 3).map(f => f.name).join(", ")
        const moreCount = oversizedFiles.length > 3 ? ` 외 ${oversizedFiles.length - 3}개` : ""
        
        toast({
          title: "파일 크기 초과",
          description: `폴더 내에 ${maxSizeMB}MB를 초과하는 파일이 ${oversizedFiles.length}개 있습니다: ${oversizedFileNames}${moreCount}`,
          variant: "destructive",
        })
        return
      }
    }
    
    // 개별 파일 업로드 시 크기 제한 재확인
    if (!isFolderUpload && uploadedFile) {
      const MAX_FILE_SIZES: Record<string, number> = {
        excel: 50 * 1024 * 1024, // 50MB
        pdf: 500 * 1024 * 1024, // 500MB
        dicom: 100 * 1024 * 1024, // 100MB
        nifti: 500 * 1024 * 1024, // 500MB
      }
      
      const maxSize = MAX_FILE_SIZES[fileType] || 500 * 1024 * 1024
      
      if (uploadedFile.size > maxSize) {
        const maxSizeMB = (maxSize / 1024 / 1024).toFixed(0)
        const currentSizeMB = (uploadedFile.size / 1024 / 1024).toFixed(2)
        
        toast({
          title: "파일 크기 초과",
          description: `파일 크기가 최대 ${maxSizeMB}MB를 초과합니다. (현재: ${currentSizeMB}MB)`,
          variant: "destructive",
        })
        return
      }
    }

    // 사용자 정보가 없으면 로드 시도
    let currentUser = user
    if (!currentUser) {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" })
        if (res.ok) {
          const me = await res.json()
          currentUser = me
          setUser(me)
        }
      } catch (error) {
        console.error("[Upload] Failed to load user:", error)
      }
    }

    setIsLoading(true)
    setUploadProgress(0)

    try {
      // FormData 생성
      const formData = new FormData()
      if (isFolderUpload && uploadedFiles.length > 0) {
        // 폴더 업로드
        uploadedFiles.forEach(file => {
          formData.append("files", file)
        })
        // 폴더 이름이 비어있으면 원본 폴더 이름 사용, 있으면 사용자가 입력한 이름 사용
        // folderName이 비어있으면 folderPath에서 마지막 폴더 이름만 추출하여 원본 폴더 이름으로 사용
        const folderNameToSend = folderName.trim() || (folderPath ? folderPath.split(/[/\\]/).pop() || folderPath : "")
        formData.append("folderName", folderNameToSend)
      } else if (uploadedFile) {
        // 개별 파일 업로드
        formData.append("file", uploadedFile)
        // 7z나 zip 파일은 자동으로 zip 타입으로 처리
        const fileExtension = uploadedFile.name.split('.').pop()?.toLowerCase()
        if (fileExtension === '7z' || fileExtension === 'zip') {
          formData.append("fileType", "zip")
        } else {
          formData.append("fileType", fileType)
        }
      } else {
        formData.append("fileType", fileType)
      }

      // S3에 업로드 (진행률 표시)
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

      // 폼 초기화
      handleClear()
      
      // Storage stats 다시 로드
      const storageStatsRes = await fetch("/api/storage/stats", {
        credentials: "include",
      })
      if (storageStatsRes.ok) {
        const storageStatsData = await storageStatsRes.json()
        setStorageStats(storageStatsData.stats || { excel: 0, pdf: 0, zip: 0, dicom: 0, nifti: 0, other: 0 })
      }
    } catch (error: unknown) {
      console.error("[Upload] Upload error:", error)
      if (error instanceof Error) {
        console.error("[Upload] Error message:", error.message)
        console.error("[Upload] Error stack:", error.stack)
      }
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "파일 업로드에 실패했습니다",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
      setUploadProgress(0)
    }
  }

  // 바이트를 읽기 쉬운 형식으로 변환하는 함수
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
  }

  // 원형 차트 데이터 준비
  const chartData = [
    { name: 'Excel', value: storageStats.excel, color: '#3b82f6', formatted: formatBytes(storageStats.excel) },
    { name: 'PDF', value: storageStats.pdf, color: '#ef4444', formatted: formatBytes(storageStats.pdf) },
    { name: 'ZIP', value: storageStats.zip, color: '#10b981', formatted: formatBytes(storageStats.zip) },
    { name: 'DICOM', value: storageStats.dicom, color: '#8b5cf6', formatted: formatBytes(storageStats.dicom) },
    { name: 'NIFTI', value: storageStats.nifti, color: '#f59e0b', formatted: formatBytes(storageStats.nifti) },
    { name: 'Other', value: storageStats.other, color: '#6b7280', formatted: formatBytes(storageStats.other) },
  ].filter(item => item.value > 0)

  const totalSize = storageStats.excel + storageStats.pdf + storageStats.zip + storageStats.dicom + storageStats.nifti + storageStats.other

  return (
    <div className="mx-auto max-w-7xl p-6 select-none">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">파일 업로드</h1>
      </div>

      <div className="grid gap-6 mb-8 md:grid-cols-2">
        {/* 업로드 폼 */}
        <Card className="max-w-2xl w-full">
          <CardHeader className="relative">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Upload</CardTitle>
                <CardDescription>서버로 파일을 업로드 합니다</CardDescription>
              </div>
              <Button type="button" variant="outline" onClick={handleClear} className="ml-4">
                초기화
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="fileType">파일 타입 *</Label>
                <Select value={fileType} onValueChange={(value: "excel" | "pdf" | "dicom" | "nifti" | "other") => {
                  setFileType(value)
                  if (isFolderUpload && allFolderFiles.length > 0) {
                    // 폴더가 이미 선택된 경우, 파일 타입 변경 시 필터링만 다시 수행
                    const allowedExtensions: Record<string, string[]> = {
                      excel: ['xlsx', 'xls', 'csv'],
                      pdf: ['pdf'],
                      dicom: ['dcm', 'dicom'],
                      nifti: ['nii', 'nii.gz', 'nifti'],
                      other: [], // 기타는 모든 파일 허용
                    }
                    const extensions = allowedExtensions[value] || []
                    // 파일 확장자 체크 헬퍼 함수
                    const checkFileExtension = (fileName: string, allowedExts: string[]): boolean => {
                      // 기타 타입은 모든 파일 허용
                      if (value === 'other') {
                        return true
                      }
                      const fileNameLower = fileName.toLowerCase()
                      if (fileNameLower.endsWith('.nii.gz')) {
                        return allowedExts.includes('nii.gz')
                      }
                      const extension = fileName.split('.').pop()?.toLowerCase()
                      return extension ? allowedExts.includes(extension) : false
                    }
                    const filteredFiles = allFolderFiles.filter(file => {
                      return checkFileExtension(file.name, extensions)
                    })
                    setUploadedFiles(filteredFiles)
                  } else {
                    setUploadedFile(null)
                    setUploadedFiles([])
                    setAllFolderFiles([])
                    setFolderPath("")
                    setFolderName("")
                    const fileInput = document.getElementById("fileInput") as HTMLInputElement
                    if (fileInput) {
                      fileInput.value = ""
                    }
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="excel">Excel (.xlsx, .xls, .csv)</SelectItem>
                    <SelectItem value="pdf">PDF (.pdf)</SelectItem>
                    <SelectItem value="dicom">DICOM (.dcm, .dicom)</SelectItem>
                    <SelectItem value="nifti">NIFTI (.nii, .nii.gz, .nifti)</SelectItem>
                    <SelectItem value="other">기타</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-4">
                  <Label htmlFor="fileInput">{isFolderUpload ? "폴더 선택 *" : "파일 선택 *"}</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="folderUpload"
                      checked={isFolderUpload}
                      onChange={(e) => {
                        setIsFolderUpload(e.target.checked)
                        setUploadedFile(null)
                        setUploadedFiles([])
                        setAllFolderFiles([])
                        setFolderPath("")
                        setFolderName("")
                        const fileInput = document.getElementById("fileInput") as HTMLInputElement
                        if (fileInput) {
                          fileInput.value = ""
                        }
                      }}
                      className="h-4 w-4"
                    />
                    <Label htmlFor="folderUpload" className="text-sm font-normal cursor-pointer">
                      폴더 업로드
                    </Label>
                  </div>
                </div>
                {isFolderUpload && (
                  <p className="text-xs text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/20 p-2 rounded border border-amber-200 dark:border-amber-800">
                    ⚠️ 웹 보안정책상 폴더 선택 시 내부 파일들이 파일 선택 대화상자에 표시되지 않습니다. 폴더를 선택한 후 아래에 표시되는 파일 목록을 확인하세요.
                  </p>
                )}
                <div className="flex items-center gap-4">
                  {isFolderUpload ? (
                    <div className="flex-1 flex items-center gap-2">
                      <Input
                        type="text"
                        value={folderPath || ""}
                        readOnly
                        className="cursor-default bg-muted"
                        placeholder="폴더를 선택하세요"
                      />
                      <input
                        id="fileInput"
                        type="file"
                        {...({ webkitdirectory: "", directory: "", multiple: true } as any)}
                        onChange={handleFileChange}
                        className="hidden"
                        required
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const fileInput = document.getElementById("fileInput") as HTMLInputElement
                          if (fileInput) {
                            fileInput.click()
                          }
                        }}
                      >
                        {folderPath ? "폴더 변경" : "폴더 선택"}
                      </Button>
                    </div>
                  ) : (
                    <Input
                      id="fileInput"
                      type="file"
                      onChange={handleFileChange}
                      className="cursor-pointer"
                      required
                    />
                  )}
                </div>
                
                {/* 파일 정보 표시 영역 */}
                {uploadedFile && (
                  <div className="space-y-2 p-3 border rounded-md bg-muted/50">
                    <div className="flex items-center gap-2 text-sm">
                      <Upload className="h-4 w-4 shrink-0" />
                      <span className="truncate font-medium">{uploadedFile.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground pl-6">
                      용량: {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                )}

                {isFolderUpload && allFolderFiles.length > 0 && (
                  <div className="space-y-2 p-3 border rounded-md bg-muted/50">
                    <div className="flex items-center gap-2 text-sm">
                      <Upload className="h-4 w-4 shrink-0" />
                      <span className="font-medium">
                        {allFolderFiles.length}개 파일 (업로드: {uploadedFiles.length}개)
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground pl-6">
                      총 용량: {(allFolderFiles.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024 / 1024).toFixed(2)} GB
                      {uploadedFiles.length > 0 && (
                        <span className="ml-2">
                          (업로드 용량: {(uploadedFiles.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024 / 1024).toFixed(2)} GB)
                        </span>
                      )}
                    </div>
                    <div className="max-h-96 overflow-y-auto mt-2 space-y-1 border-t pt-2">
                      <div className="text-xs font-medium mb-2 pl-6 sticky top-0 bg-muted/50 py-1 -mt-2 -pt-2 z-10 select-none">폴더 내 파일 목록 ({allFolderFiles.length}개):</div>
                      <div className="space-y-1">
                        {allFolderFiles.map((file, index) => {
                          const allowedExtensions: Record<string, string[]> = {
                            excel: ['xlsx', 'xls', 'csv'],
                            pdf: ['pdf'],
                            dicom: ['dcm', 'dicom'],
                            nifti: ['nii', 'nii.gz', 'nifti'],
                            other: [], // 기타는 모든 파일 허용
                          }
                          const extensions = fileType ? allowedExtensions[fileType] || [] : []
                          // 파일 확장자 체크 헬퍼 함수
                          const checkFileExtension = (fileName: string, allowedExts: string[]): boolean => {
                            // 기타 타입은 모든 파일 허용
                            if (fileType === 'other') {
                              return true
                            }
                            const fileNameLower = fileName.toLowerCase()
                            if (fileNameLower.endsWith('.nii.gz')) {
                              return allowedExts.includes('nii.gz')
                            }
                            const extension = fileName.split('.').pop()?.toLowerCase()
                            return extension ? allowedExts.includes(extension) : false
                          }
                          const willUpload = checkFileExtension(file.name, extensions)
                          
                          return (
                            <div 
                              key={index} 
                              className={`text-xs pl-6 py-1.5 flex items-center justify-between hover:bg-muted/30 rounded select-none ${
                                willUpload ? 'text-foreground font-medium' : 'text-muted-foreground opacity-60'
                              }`}
                            >
                              <span className="truncate flex-1 min-w-0">
                                {file.name}
                                {!willUpload && <span className="ml-2 text-xs text-muted-foreground">(업로드 제외)</span>}
                              </span>
                              <span className="ml-2 shrink-0 whitespace-nowrap">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  {isFolderUpload 
                    ? (
                      <>
                        폴더를 선택하면 모든 파일 형식이 표시되며, {fileType === "other" ? "기타 타입을 선택하면 모든 파일이 업로드됩니다." : `선택한 파일 타입(${fileType === "excel" ? "Excel" : fileType === "pdf" ? "PDF" : fileType === "dicom" ? "DICOM" : "NIFTI"})과 일치하는 파일만 업로드됩니다. 폴더 내 모든 파일은 선택한 파일 타입과 일치해야 합니다.`}
                        <br />
                        최대 폴더 크기: 5GB, 개별 파일: 500MB
                      </>
                    )
                    : (
                      <>
                        {fileType === "other" ? "기타 타입을 선택하면 모든 파일 형식이 업로드 가능합니다." : `모든 파일 형식이 표시되며, 선택한 파일 타입(${fileType === "excel" ? "Excel (.xlsx, .xls, .csv)" : fileType === "pdf" ? "PDF (.pdf)" : fileType === "dicom" ? "DICOM (.dcm, .dicom)" : "NIFTI (.nii, .nii.gz, .nifti)"})과 일치하는 파일만 업로드 가능합니다.`}
                        <br />
                        최대 크기: 500MB
                      </>
                    )}
                </p>
              </div>

              {isFolderUpload && uploadedFiles.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="folderName" className="text-sm">폴더 이름 (선택사항)</Label>
                  <Input
                    id="folderName"
                    type="text"
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value)}
                    placeholder={folderPath || "폴더 이름을 입력하세요"}
                    className="text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    비워두면 원본 폴더 이름({folderPath ? folderPath.split(/[/\\]/).pop() || folderPath : ""})이 사용됩니다
                  </p>
                </div>
              )}

              <div className="flex justify-end">
                <Button type="submit" disabled={isLoading || (!uploadedFile && uploadedFiles.length === 0)}>
                  {isLoading ? "업로드 중..." : "업로드"}
                </Button>
              </div>
              {isLoading && (
                <div className="mt-3">
                  <Progress value={uploadProgress} />
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Storage 차트 */}
        <Card className="h-full flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2 shrink-0">
            <div>
              <CardTitle className="text-sm font-medium">Storage</CardTitle>
            </div>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex-1 flex items-center justify-center min-h-0">
            {totalSize > 0 && chartData.length > 0 ? (
              <div className="flex items-center justify-center h-[260px]">
                <ChartContainer
                  config={{
                    excel: { label: "Excel", color: "#3b82f6" },
                    pdf: { label: "PDF", color: "#ef4444" },
                    zip: { label: "ZIP", color: "#10b981" },
                    dicom: { label: "DICOM", color: "#8b5cf6" },
                    nifti: { label: "NIFTI", color: "#f59e0b" },
                    other: { label: "Other", color: "#6b7280" },
                  }}
                  className="h-[260px] w-full"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}\n${(percent * 100).toFixed(1)}%`}
                        outerRadius={90}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <ChartTooltip 
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload as typeof chartData[0]
                            return (
                              <div className="rounded-lg border bg-background p-2 shadow-sm">
                                <div className="grid gap-2">
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-sm font-medium">{data.name}</span>
                                    <span className="text-sm font-bold">{data.formatted}</span>
                                  </div>
                                </div>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[260px] text-muted-foreground">
                <p className="text-sm mb-2">업로드된 파일이 없습니다</p>
                <p className="text-xs">S3에 파일을 업로드하면 여기에 표시됩니다</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

