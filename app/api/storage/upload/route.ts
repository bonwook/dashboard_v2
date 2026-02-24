import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { uploadToS3, isAwsCredentialsError, AWS_CREDENTIALS_USER_MESSAGE } from "@/lib/aws/s3"
import { query } from "@/lib/db/mysql"
import { randomUUID } from "crypto"
import { sanitizeFilename, isValidFilename } from "@/lib/utils/filename"
import { validateMimeType } from "@/lib/utils/mime-validator"

// 지원하는 확장자 목록
const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  excel: ['xlsx', 'xls', 'csv'],
  pdf: ['pdf'],
  dicom: ['dcm', 'dicom'],
  nifti: ['nii', 'nii.gz', 'nifti'],
  zip: ['zip', '7z'],
}

// 파일 타입별 최대 크기 제한 (bytes)
const MAX_FILE_SIZES: Record<string, number> = {
  excel: 500 * 1024 * 1024, // 500MB
  pdf: 500 * 1024 * 1024, // 500MB
  dicom: 500 * 1024 * 1024, // 500MB
  nifti: 500 * 1024 * 1024, // 500MB
  zip: 500 * 1024 * 1024, // 500MB
  other: 500 * 1024 * 1024, // 기본값 500MB
}

// 폴더 업로드 최대 크기 제한 (bytes)
const MAX_FOLDER_SIZE = 5 * 1024 * 1024 * 1024 // 5GB

// 파일 확장자로 파일 타입 결정
function determineFileType(fileName: string, providedFileType?: string | null): string {
  if (providedFileType) {
    return providedFileType
  }
  
  const extension = fileName.split('.').pop()?.toLowerCase()
  if (!extension) {
    return 'other'
  }
  
  // .nii.gz 같은 경우를 처리하기 위해 파일명 전체 확인
  const fileNameLower = fileName.toLowerCase()
  
  if (ALLOWED_EXTENSIONS.excel.includes(extension)) {
    return 'excel'
  } else if (ALLOWED_EXTENSIONS.pdf.includes(extension)) {
    return 'pdf'
  } else if (ALLOWED_EXTENSIONS.dicom.includes(extension)) {
    return 'dicom'
  } else if (fileNameLower.endsWith('.nii.gz') || ALLOWED_EXTENSIONS.nifti.includes(extension)) {
    return 'nifti'
  } else if (ALLOWED_EXTENSIONS.zip.includes(extension)) {
    return 'zip'
  }
  
  return 'other'
}

// 파일 확장자 추출 (확장자명 폴더용)
function getExtensionFolder(fileName: string): string {
  const fileNameLower = fileName.toLowerCase()
  
  // .nii.gz 같은 경우 먼저 체크
  if (fileNameLower.endsWith('.nii.gz')) {
    return 'nii.gz'
  }
  
  const extension = fileNameLower.split('.').pop()?.toLowerCase()
  if (!extension) {
    return 'other'
  }
  
  return extension
}

// POST /api/storage/upload - 파일 업로드
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value
    
    if (!token) {
      console.error("[API Upload] No token provided")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    const decoded = verifyToken(token)
    
    if (!decoded) {
      console.error("[API Upload] Invalid token")
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const files = formData.getAll("files") as File[] // 폴더 업로드용
    const path = formData.get("path") as string | null
    const bucket = formData.get("bucket") as string | null
    const fileType = formData.get("fileType") as string | null // excel, pdf, dicom
    const description = formData.get("description") as string | null
    const folderName = formData.get("folderName") as string | null // 폴더 이름
    const useProgressZipPath = formData.get("useProgressZipPath") === "true" // ProgressZip 경로 사용 여부

    const userId = decoded.id
    const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME!
    const uploadedFiles: Array<{ path: string; fileId: string }> = []

    // 폴더 업로드 처리
    if (files.length > 0) {
      const extensions = fileType ? ALLOWED_EXTENSIONS[fileType] || [] : 
        [...ALLOWED_EXTENSIONS.excel, ...ALLOWED_EXTENSIONS.pdf, ...ALLOWED_EXTENSIONS.dicom, ...ALLOWED_EXTENSIONS.nifti]

      // 폴더 전체 크기 제한 확인
      const totalSize = files.reduce((sum, file) => sum + file.size, 0)
      if (totalSize > MAX_FOLDER_SIZE) {
        console.error("[API Upload] Folder size exceeds limit:", totalSize, "bytes")
        return NextResponse.json(
          { error: `폴더 크기가 ${(MAX_FOLDER_SIZE / 1024 / 1024 / 1024).toFixed(0)}GB를 초과합니다. (현재: ${(totalSize / 1024 / 1024 / 1024).toFixed(2)}GB)` },
          { status: 400 }
        )
      }

      // 파일 타입별 개별 파일 크기 제한 확인
      const maxFileSize = fileType ? MAX_FILE_SIZES[fileType] || MAX_FILE_SIZES.other : MAX_FILE_SIZES.other
      const oversizedFiles = files.filter(file => file.size > maxFileSize)
      
      if (oversizedFiles.length > 0) {
        const maxSizeMB = (maxFileSize / 1024 / 1024).toFixed(0)
        const oversizedFileNames = oversizedFiles.slice(0, 3).map(f => f.name).join(", ")
        const moreCount = oversizedFiles.length > 3 ? ` 외 ${oversizedFiles.length - 3}개` : ""
        console.error("[API Upload] Files exceed size limit:", oversizedFiles.length, "files")
        return NextResponse.json(
          { error: `폴더 내에 ${maxSizeMB}MB를 초과하는 파일이 ${oversizedFiles.length}개 있습니다: ${oversizedFileNames}${moreCount}` },
          { status: 400 }
        )
      }

      // 폴더 이름 결정
      // - 폴더 이름을 정하면: 사용자가 입력한 이름 사용
      // - 폴더 이름을 안 정하면: 원본 폴더 이름 사용
      let finalFolderName = ""
      
      // 1순위: 클라이언트에서 전달한 폴더 이름 (사용자가 입력한 이름 또는 원본 폴더 이름)
      // 클라이언트에서 이미 원본 폴더 이름으로 처리되어 전달됨
      if (folderName && folderName.trim()) {
        finalFolderName = folderName.trim()
      } 
      // 2순위: 첫 번째 파일의 경로에서 원본 폴더 이름 추출 (폴더 이름을 안 정한 경우)
      else if (files.length > 0) {
        const firstFile = files[0] as any
        if (firstFile.webkitRelativePath) {
          const pathParts = firstFile.webkitRelativePath.split('/')
          if (pathParts.length > 1) {
            finalFolderName = pathParts[0].trim() // 첫 번째 부분이 폴더 이름
          }
        }
      }
      
      // 폴더 이름 정규화 (공백, 특수문자 처리)
      if (finalFolderName) {
        // 슬래시, 백슬래시 제거 및 공백 정리
        finalFolderName = finalFolderName.replace(/[/\\]/g, '-').trim()
        // 빈 문자열이면 다시 설정하지 않음
        if (!finalFolderName) {
          finalFolderName = ""
        }
      }
      
      // 폴더 내 파일명 중복 체크를 위한 Set
      const fileNamesInFolder = new Set<string>()
      // 실제 업로드된 파일의 s3_key를 추적하여 중복 방지
      const uploadedS3Keys = new Set<string>()
      
      for (const uploadFile of files) {
        const extension = uploadFile.name.split('.').pop()?.toLowerCase()
        
        // 확장자 필터링
        if (!extension || !extensions.includes(extension)) {
          continue
        }

        // MIME 타입 검증 (확장자 조작 공격 방어)
        if (!validateMimeType(uploadFile, extension)) {
          console.warn(`[API Upload] MIME 타입 불일치: ${uploadFile.name} (${uploadFile.type})`)
          // MIME 타입이 일치하지 않아도 업로드 허용 (일부 시스템에서 MIME 타입이 부정확할 수 있음)
          // 프로덕션에서는 더 엄격하게 처리할 수 있음
        }

        // 파일 타입 결정
        const determinedFileType = determineFileType(uploadFile.name, fileType)

        const buffer = Buffer.from(await uploadFile.arrayBuffer())
        const contentType = uploadFile.type || "application/octet-stream"
        
        // 파일명 추출: webkitRelativePath가 있으면 파일명만, 없으면 uploadFile.name에서 경로 제거
        // webkitRelativePath는 "폴더명/파일명" 형태이므로 파일명만 추출
        let baseFileName = uploadFile.name
        const uploadFileWithPath = uploadFile as any
        if (uploadFileWithPath.webkitRelativePath) {
          const pathParts = uploadFileWithPath.webkitRelativePath.split('/')
          baseFileName = pathParts[pathParts.length - 1] // 마지막 부분이 파일명
        } else {
          // uploadFile.name에 경로가 포함되어 있을 수 있으므로 경로 제거
          // 슬래시(/) 또는 백슬래시(\)로 분리하여 마지막 부분만 파일명으로 사용
          const nameParts = uploadFile.name.split(/[/\\]/)
          if (nameParts.length > 1) {
            baseFileName = nameParts[nameParts.length - 1] // 마지막 부분이 파일명
          }
        }
        
        // 파일명 보안 검증 및 Sanitization (경로 문자만 제거, 나머지 유지)
        // 경로 탐색 공격 방어를 위해 경로 관련 문자만 제거
        if (!isValidFilename(baseFileName)) {
          console.warn(`[API Upload] 위험한 파일명 감지, sanitize: ${baseFileName}`)
        }
        // 경로 문자만 제거하고 나머지 특수문자는 유지
        let sanitized = baseFileName
          .replace(/\.\./g, "") // .. 제거
          .replace(/[\/\\]/g, "_") // /, \ 를 _ 로 변경
          .trim()
        
        // 빈 문자열이면 원본 파일명 사용
        if (!sanitized) {
          sanitized = baseFileName.replace(/[\/\\]/g, "_").trim() || "file"
        }
        
        // 파일명 길이 제한 (255자)
        if (sanitized.length > 255) {
          const ext = sanitized.split(".").pop()
          const nameWithoutExt = sanitized.substring(0, sanitized.lastIndexOf("."))
          sanitized = nameWithoutExt.substring(0, 255 - (ext ? ext.length + 1 : 0)) + (ext ? `.${ext}` : "")
        }
        
        baseFileName = sanitized
        
        // 파일명 중복 처리: 같은 이름이 있으면 timestamp 추가
        let fileName = baseFileName
        if (fileNamesInFolder.has(fileName)) {
          const timestamp = Date.now()
          const nameParts = baseFileName.split('.')
          const ext = nameParts.pop()
          const nameWithoutExt = nameParts.join('.')
          fileName = `${nameWithoutExt}-${timestamp}.${ext}`
        }
        fileNamesInFolder.add(fileName)
        
        // 계층구조: {userId}/{extension}/{filename} 또는 temp/Dicom/{userId}/{filename}
        // - dicom 파일인 경우: temp/Dicom/{userId}/정한 폴더이름/파일들 또는 temp/Dicom/{userId}/파일들
        // - excel, pdf, nifti, other, zip 파일인 경우: {userId}/{extension}/정한 폴더이름/파일들 또는 {userId}/{extension}/파일들
        let s3Key: string
        if (determinedFileType === 'dicom') {
          s3Key = finalFolderName 
            ? `temp/Dicom/${userId}/${finalFolderName}/${fileName}`
            : `temp/Dicom/${userId}/${fileName}`
        } else {
          // 확장자명 폴더로 저장
          const extensionFolder = getExtensionFolder(uploadFile.name)
          s3Key = finalFolderName 
            ? `${userId}/${extensionFolder}/${finalFolderName}/${fileName}`
            : `${userId}/${extensionFolder}/${fileName}`
        }
        
        // 중복 s3_key 체크: 이미 업로드된 파일이면 스킵
        if (uploadedS3Keys.has(s3Key)) {
          continue
        }
        uploadedS3Keys.add(s3Key)

        // S3에 업로드
        const s3Path = await uploadToS3(buffer, s3Key, contentType)

        // DB에 저장
        const fileId = randomUUID()
        await query(
          `INSERT INTO user_files (
            id, user_id, file_name, file_path, s3_key, s3_bucket, 
            file_size, content_type, file_type, uploaded_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            fileId,
            userId,
            fileName, // 실제 저장된 파일명 사용
            s3Path,
            s3Key,
            BUCKET_NAME,
            uploadFile.size,
            contentType,
            determinedFileType || 'other',
          ]
        )

        uploadedFiles.push({ path: s3Key, fileId })
      }

      return NextResponse.json({ files: uploadedFiles, count: uploadedFiles.length })
    }

    // 개별 파일 업로드 처리
    if (!file) {
      console.error("[API Upload] No file provided")
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const extension = file.name.split('.').pop()?.toLowerCase()
    
    // MIME 타입 검증 (확장자 조작 공격 방어)
    if (extension && !validateMimeType(file, extension)) {
      console.warn(`[API Upload] MIME 타입 불일치: ${file.name} (${file.type})`)
      // MIME 타입이 일치하지 않아도 업로드 허용 (일부 시스템에서 MIME 타입이 부정확할 수 있음)
    }

    // 파일 타입 결정
    const determinedFileType = determineFileType(file.name, fileType)
    
    // 파일 크기 제한 확인
    const maxFileSize = MAX_FILE_SIZES[determinedFileType] || MAX_FILE_SIZES.other
    if (file.size > maxFileSize) {
      const maxSizeMB = (maxFileSize / 1024 / 1024).toFixed(0)
      const currentSizeMB = (file.size / 1024 / 1024).toFixed(2)
      console.error("[API Upload] File size exceeds limit:", file.size, "bytes, max:", maxFileSize, "bytes")
      return NextResponse.json(
        { error: `파일 크기가 최대 ${maxSizeMB}MB를 초과합니다. (현재: ${currentSizeMB}MB)` },
        { status: 400 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const contentType = file.type || "application/octet-stream"

    // 파일명 보안 검증 및 Sanitization (경로 문자만 제거, 나머지 유지)
    let baseFileName = file.name
    // 파일명에서 경로 제거 (보안)
    const nameParts = baseFileName.split(/[/\\]/)
    if (nameParts.length > 1) {
      baseFileName = nameParts[nameParts.length - 1]
    }
    
    if (!isValidFilename(baseFileName)) {
      console.warn(`[API Upload] 위험한 파일명 감지, sanitize: ${baseFileName}`)
    }
    // 경로 문자만 제거하고 나머지 특수문자는 유지
    let sanitized = baseFileName
      .replace(/\.\./g, "") // .. 제거
      .replace(/[\/\\]/g, "_") // /, \ 를 _ 로 변경
      .trim()
    
    // 빈 문자열이면 원본 파일명 사용
    if (!sanitized) {
      sanitized = baseFileName.replace(/[\/\\]/g, "_").trim() || "file"
    }
    
    // 파일명 길이 제한 (255자)
    if (sanitized.length > 255) {
      const ext = sanitized.split(".").pop()
      const nameWithoutExt = sanitized.substring(0, sanitized.lastIndexOf("."))
      sanitized = nameWithoutExt.substring(0, 255 - (ext ? ext.length + 1 : 0)) + (ext ? `.${ext}` : "")
    }
    
    baseFileName = sanitized

    // 사용자별 key 구성: {userId}/{filename} 또는 temp/Dicom/{userId}/{filename}
    // ProgressZip 경로인 경우: temp/ProgressZip/{userId}/{filename}
    // temp/attachment/ 경로인 경우: temp/attachment/{userId}/{filename}
    // dicom 파일인 경우: temp/Dicom/{userId}/{filename}
    // excel, pdf, nifti, other 파일인 경우: {userId}/{filename}
    let s3Key: string
    if (useProgressZipPath && path) {
      // ProgressZip 경로인 경우, path에 userId를 추가
      // path에서 timestamp prefix 제거
      const pathWithoutPrefix = path.replace(/^ProgressZip\//, '').replace(/^temp\/ProgressZip\//, '').replace(/^\d+-/, '')
      s3Key = `temp/ProgressZip/${userId}/${pathWithoutPrefix}`
    } else if (path && path.startsWith('temp/attachment/')) {
      // temp/attachment/ 경로인 경우, API에서 토큰의 userId를 사용하여 경로 재구성
      // path는 "temp/attachment/{fileName}" 형태로 전달됨
      const pathParts = path.split('/')
      // temp/attachment/filename 형태에서 filename 추출
      if (pathParts.length >= 3) {
        // 이미 userId가 포함된 경우 (기존 호환성)
        const pathUserId = pathParts[2]
        // pathParts[2]가 UUID 형식인지 확인 (userId는 UUID)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        if (uuidRegex.test(pathUserId)) {
          // userId인 경우
          s3Key = `temp/attachment/${pathUserId}/${baseFileName}`
        } else {
          // 파일명인 경우 (path가 "temp/attachment/filename" 형태)
          s3Key = `temp/attachment/${userId}/${baseFileName}`
        }
      } else if (pathParts.length === 2) {
        // path가 "temp/attachment/filename" 형태인 경우
        s3Key = `temp/attachment/${userId}/${baseFileName}`
      } else {
        // 경로 형식이 잘못된 경우 userId 사용
        s3Key = `temp/attachment/${userId}/${baseFileName}`
      }
    } else if (determinedFileType === 'dicom') {
      // dicom 파일인 경우 temp/Dicom/ 경로 사용
      s3Key = path || `temp/Dicom/${userId}/${baseFileName}`
    } else {
      // excel, pdf, nifti, other, zip 파일인 경우 {userId}/{extension}/파일명 사용
      // path가 지정된 경우 그대로 사용, 아니면 확장자명 폴더 추가
      if (path) {
        s3Key = path
      } else {
        const extensionFolder = getExtensionFolder(file.name)
        s3Key = `${userId}/${extensionFolder}/${baseFileName}`
      }
    }

    // S3에 업로드
    const s3Path = await uploadToS3(buffer, s3Key, contentType)

    // user_files 테이블에 파일 정보 저장
    const fileId = randomUUID()
    
    await query(
      `INSERT INTO user_files (
        id, user_id, file_name, file_path, s3_key, s3_bucket, 
        file_size, content_type, file_type, uploaded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        fileId,
        userId,
        file.name,
        s3Path,
        s3Key,
        BUCKET_NAME,
        file.size,
        contentType,
        determinedFileType || 'other',
      ]
    )

    // s3Key를 path로 반환 (s3Path는 uploadToS3의 반환값이지만, 실제로는 s3Key를 사용)
    return NextResponse.json({ path: s3Key, fileId })
  } catch (error) {
    console.error("[API Upload] Error uploading file:", error)
    if (isAwsCredentialsError(error)) {
      console.error("[API Upload] AWS credentials expired or not set. Set AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY in .env or run: aws sso login")
      return NextResponse.json({ error: AWS_CREDENTIALS_USER_MESSAGE }, { status: 503 })
    }
    if (error instanceof Error) {
      console.error("[API Upload] Error message:", error.message)
      console.error("[API Upload] Error stack:", error.stack)
      return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}


