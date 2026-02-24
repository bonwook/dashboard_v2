import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { GetObjectCommand } from "@aws-sdk/client-s3"
import ExcelJS from "exceljs"
import iconv from "iconv-lite"
import { s3Client } from "@/lib/aws/s3"

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME!

// Excel 셀 값을 안전하게 문자열로 변환하는 헬퍼 함수
function getCellValueAsString(cell: ExcelJS.Cell): string {
  try {
    const value = cell.value
    if (value === null || value === undefined) {
      return ""
    }
    if (cell.text !== undefined && cell.text !== null && typeof value === "string") {
      return value
    }
    if (typeof value === "string") {
      return value
    }
    if (typeof value === "number") {
      return value.toString()
    }
    if (typeof value === "boolean") {
      return value ? "TRUE" : "FALSE"
    }
    if (value instanceof Date) {
      return value.toISOString()
    }
    return String(value)
  } catch {
    return ""
  }
}

// GET /api/storage/preview - 파일 미리보기 데이터 반환
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const decoded = verifyToken(token)
    if (!decoded) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const s3Key = searchParams.get("key")
    const fileType = searchParams.get("fileType") // excel, pdf, dicom

    if (!s3Key) {
      return NextResponse.json({ error: "Key is required" }, { status: 400 })
    }

    // Extract key from s3:// path or use as-is
    const key = s3Key.startsWith("s3://") ? s3Key.replace(`s3://${BUCKET_NAME}/`, "") : s3Key

    // S3에서 파일 다운로드
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    })

    const response = await s3Client.send(command)
    if (!response.Body) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    const uint8Array = await response.Body.transformToByteArray()
    // Uint8Array를 ArrayBuffer로 변환 (ExcelJS는 ArrayBuffer를 직접 받을 수 있음)
    const arrayBuffer = uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength)
    const buffer = Buffer.from(uint8Array)

    // 파일 확장자로 타입 확인
    const fileExtension = key.toLowerCase().split('.').pop()
    const isCSV = fileExtension === 'csv' || key.toLowerCase().endsWith('.csv')
    const isExcel = fileExtension === 'xlsx' || fileExtension === 'xls' || (fileType === "excel" && !isCSV) || key.includes("/excel/")
    const isDICOM = fileExtension === 'dcm' || fileExtension === 'dicom' || fileType === "dicom" || key.includes("/dicom/")
    const isNIFTI = fileExtension === 'nii' || fileExtension === 'gz' || fileType === "nifti" || key.includes("/nifti/") || key.toLowerCase().endsWith('.nii.gz')
    const isPDF = fileExtension === 'pdf' || fileType === "pdf" || key.includes("/pdf/")

    // CSV 파일 처리
    if (isCSV) {
      try {
        // CSV 파싱 함수들
        function parseCSV(buffer: Buffer, encoding: string = "utf8"): string {
          try {
            if (encoding === "cp949" || encoding === "euc-kr") {
              return iconv.decode(buffer, "cp949")
            }
            return buffer.toString("utf8")
          } catch (error) {
            return buffer.toString("utf8")
          }
        }

        function parseCSVLine(line: string): string[] {
          const result: string[] = []
          let current = ""
          let inQuotes = false
          
          for (let i = 0; i < line.length; i++) {
            const char = line[i]
            
            if (char === '"') {
              if (inQuotes && line[i + 1] === '"') {
                current += '"'
                i++
              } else {
                inQuotes = !inQuotes
              }
            } else if (char === ',' && !inQuotes) {
              result.push(current.trim())
              current = ""
            } else {
              current += char
            }
          }
          result.push(current.trim())
          return result
        }

        // 여러 인코딩 시도
        let text: string | null = null
        let bestText: string | null = null
        let bestScore = -1
        const encodings = ["cp949", "euc-kr", "utf8"]
        
        for (const enc of encodings) {
          try {
            const decoded = parseCSV(buffer, enc)
            const koreanCount = (decoded.match(/[가-힣]/g) || []).length
            const nonAsciiCount = (decoded.match(/[^\x00-\x7F]/g) || []).length
            const score = koreanCount * 10 + nonAsciiCount
            
            if (koreanCount > 0 && score > bestScore) {
              bestScore = score
              bestText = decoded
              if (koreanCount > 10) {
                text = decoded
                break
              }
            } else if (score > bestScore) {
              bestScore = score
              bestText = decoded
            }
          } catch (err) {
            continue
          }
        }
        
        if (!text && bestText) {
          text = bestText
        }
        if (!text) {
          text = buffer.toString("utf8")
        }

        const lines = text.split(/\r?\n/).filter(line => line.trim() !== "")
        
        if (lines.length === 0) {
          return NextResponse.json({
            type: "csv",
            headers: [],
            data: [],
            error: "CSV 파일에 데이터가 없습니다."
          })
        }

        // 헤더 찾기 (최대 50줄까지)
        let headerRowIndex = 0
        let headers: string[] = []
        const MAX_SEARCH_ROWS = 50
        
        for (let i = 0; i < Math.min(MAX_SEARCH_ROWS, lines.length); i++) {
          const parsedLine = parseCSVLine(lines[i])
          const validHeaders = parsedLine.filter(h => h && h.trim() !== "")
          
          if (validHeaders.length > 0) {
            let firstDataCol = 0
            for (let j = 0; j < parsedLine.length; j++) {
              if (parsedLine[j] && parsedLine[j].trim() !== "") {
                firstDataCol = j
                break
              }
            }
            let lastDataCol = parsedLine.length
            for (let j = parsedLine.length - 1; j >= 0; j--) {
              if (parsedLine[j] && parsedLine[j].trim() !== "") {
                lastDataCol = j + 1
                break
              }
            }
            headers = parsedLine.slice(firstDataCol, lastDataCol)
            headerRowIndex = i
            break
          }
        }

        if (headers.length === 0) {
          if (lines.length > 0) {
            const firstLineCols = parseCSVLine(lines[0])
            const maxCols = Math.min(50, firstLineCols.length || 50)
            headers = Array.from({ length: maxCols }, (_, i) => `Column ${i + 1}`)
          } else {
            headers = Array.from({ length: 50 }, (_, i) => `Column ${i + 1}`)
          }
          headerRowIndex = 0
        }

        // 첫 10행 데이터 추출
        const previewData: any[] = []
        let firstDataCol = 0
        if (headerRowIndex >= 0 && lines[headerRowIndex]) {
          const headerLine = parseCSVLine(lines[headerRowIndex])
          for (let j = 0; j < headerLine.length; j++) {
            if (headerLine[j] && headerLine[j].trim() !== "") {
              firstDataCol = j
              break
            }
          }
        }
        
        for (let i = headerRowIndex + 1; i < lines.length && previewData.length < 10; i++) {
          const rowValues = parseCSVLine(lines[i])
          const rowData: any = {}
          
          headers.forEach((header, index) => {
            const sourceIndex = firstDataCol + index
            rowData[header] = rowValues[sourceIndex] !== undefined ? String(rowValues[sourceIndex]) : ""
          })
          
          if (Object.values(rowData).some((val) => val !== "" && val !== null && val !== undefined)) {
            previewData.push(rowData)
          }
        }

        return NextResponse.json({
          type: "csv",
          headers,
          data: previewData,
          totalRows: lines.length - headerRowIndex - 1,
        })
      } catch (error) {
        console.error("[Preview] Error parsing CSV:", error)
        return NextResponse.json(
          { error: "Failed to parse CSV file", details: error instanceof Error ? error.message : String(error) },
          { status: 500 }
        )
      }
    }
    
    // Excel 파일 처리
    if (isExcel) {
      try {
        const workbook = new ExcelJS.Workbook()
        // ExcelJS는 ArrayBuffer를 받을 수 있지만 타입 정의가 부족하여 타입 단언 사용
        await workbook.xlsx.load(arrayBuffer as any)

        const worksheet = workbook.worksheets[0]
        if (!worksheet) {
          return NextResponse.json({ error: "No worksheet found" }, { status: 400 })
        }

        // 헤더 찾기 (최대 50행까지)
        let headerRowIndex = 0
        let headers: string[] = []
        const MAX_SEARCH_ROWS = 50

        for (let rowNum = 1; rowNum <= Math.min(MAX_SEARCH_ROWS, worksheet.rowCount || 10); rowNum++) {
          const row = worksheet.getRow(rowNum)
          if (!row) continue

          const tempHeaders: string[] = []
          let hasData = false

          for (let colNum = 1; colNum <= 20; colNum++) {
            const cell = row.getCell(colNum)
            const value = getCellValueAsString(cell)
            if (value && value.trim() !== "") {
              tempHeaders.push(value.trim())
              hasData = true
            } else {
              tempHeaders.push("")
            }
          }

          if (hasData) {
            headers = tempHeaders.filter((h) => h !== "")
            headerRowIndex = rowNum
            break
          }
        }

        if (headers.length === 0) {
          headers = Array.from({ length: 10 }, (_, i) => `Column ${i + 1}`)
        }

        // 첫 10행 데이터 추출
        const previewData: any[] = []
        const maxRows = Math.min(10, worksheet.rowCount || 10)

        for (let rowNum = headerRowIndex + 1; rowNum <= headerRowIndex + maxRows; rowNum++) {
          const row = worksheet.getRow(rowNum)
          if (!row) continue

          const rowData: any = {}
          let hasData = false

          for (let i = 0; i < headers.length; i++) {
            const cell = row.getCell(i + 1)
            const value = getCellValueAsString(cell)
            rowData[headers[i]] = value
            if (value && value.trim() !== "") {
              hasData = true
            }
          }

          if (hasData) {
            previewData.push(rowData)
          }
        }

        return NextResponse.json({
          type: "excel",
          headers,
          data: previewData,
          totalRows: worksheet.rowCount || 0,
        })
      } catch (error) {
        console.error("[Preview] Error parsing Excel:", error)
        return NextResponse.json(
          { error: "Failed to parse Excel file", details: error instanceof Error ? error.message : String(error) },
          { status: 500 }
        )
      }
    } else if (isDICOM) {
      // DICOM 파일 처리 - 중요 태그 추출
      try {
        const dicomData = {
          type: "dicom",
          metadata: {} as Record<string, any>,
          hasImage: false,
          imageDataUrl: null as string | null,
        }

        // DICOM 파일 구조 확인
        if (buffer.length > 132) {
          const dicmTag = buffer.subarray(128, 132).toString("ascii")

          if (dicmTag === "DICM") {
            dicomData.metadata.isValidDicom = true
            dicomData.metadata.fileSize = buffer.length

            // DICOM 태그 파싱 함수
            function readUint16(buffer: Buffer, offset: number, littleEndian: boolean = true): number {
              if (littleEndian) {
                return buffer.readUInt16LE(offset)
              } else {
                return buffer.readUInt16BE(offset)
              }
            }

            function readUint32(buffer: Buffer, offset: number, littleEndian: boolean = true): number {
              if (littleEndian) {
                return buffer.readUInt32LE(offset)
              } else {
                return buffer.readUInt32BE(offset)
              }
            }

            function readString(buffer: Buffer, offset: number, length: number): string {
              return buffer.subarray(offset, offset + length).toString('ascii').replace(/\0/g, '').trim()
            }

            // 중요 태그 정의
            const importantTags: Record<string, { group: number; element: number; name: string; vr?: string }> = {
              'PatientName': { group: 0x0010, element: 0x0010, name: 'Patient Name', vr: 'PN' },
              'PatientID': { group: 0x0010, element: 0x0020, name: 'Patient ID', vr: 'LO' },
              'StudyDate': { group: 0x0008, element: 0x0020, name: 'Study Date', vr: 'DA' },
              'StudyTime': { group: 0x0008, element: 0x0030, name: 'Study Time', vr: 'TM' },
              'Modality': { group: 0x0008, element: 0x0060, name: 'Modality', vr: 'CS' },
              'SequenceName': { group: 0x0018, element: 0x0024, name: 'Sequence Name', vr: 'SH' },
              'SeriesDescription': { group: 0x0008, element: 0x103E, name: 'Series Description', vr: 'LO' },
              'PixelSpacing': { group: 0x0028, element: 0x0030, name: 'Pixel Spacing', vr: 'DS' },
              'SliceThickness': { group: 0x0018, element: 0x0050, name: 'Slice Thickness', vr: 'DS' },
              'SliceLocation': { group: 0x0020, element: 0x1041, name: 'Slice Location', vr: 'DS' },
              'InstanceNumber': { group: 0x0020, element: 0x0013, name: 'Instance Number', vr: 'IS' },
              'AcquisitionTime': { group: 0x0008, element: 0x0032, name: 'Acquisition Time', vr: 'TM' },
              'ContentTime': { group: 0x0008, element: 0x0033, name: 'Content Time', vr: 'TM' },
              'TemporalPositionIdentifier': { group: 0x0020, element: 0x0100, name: 'Temporal Position Identifier', vr: 'IS' },
              'CardiacNumberOfImages': { group: 0x0018, element: 0x1089, name: 'Cardiac Number of Images', vr: 'IS' },
              'SamplesPerPixel': { group: 0x0028, element: 0x0002, name: 'Samples per Pixel', vr: 'US' },
              'Manufacturer': { group: 0x0008, element: 0x0070, name: 'Manufacturer', vr: 'LO' },
              'ManufacturerModelName': { group: 0x0008, element: 0x1090, name: 'Manufacturer Model Name', vr: 'LO' },
              'StudyInstanceUID': { group: 0x0020, element: 0x000D, name: 'Study Instance UID', vr: 'UI' },
              'SeriesInstanceUID': { group: 0x0020, element: 0x000E, name: 'Series Instance UID', vr: 'UI' },
              'SOPInstanceUID': { group: 0x0008, element: 0x0018, name: 'SOP Instance UID', vr: 'UI' },
            }

            // DICOM 데이터 요소 파싱 (최적화 버전)
            // 중요 태그만 빠르게 찾기 (처음 20KB만 파싱)
            let offset = 132 // DICM 태그 이후
            const maxOffset = Math.min(buffer.length, 20000) // 처음 20KB만 파싱 (태그는 보통 앞부분에 있음)
            const foundTags = new Set<string>() // 중복 방지
            const targetTagCount = Object.keys(importantTags).length
            let consecutiveMisses = 0 // 연속으로 태그를 찾지 못한 횟수
            const maxConsecutiveMisses = 100 // 100번 연속 실패하면 중단

            try {
              while (offset < maxOffset - 8 && foundTags.size < targetTagCount && consecutiveMisses < maxConsecutiveMisses) {
                const group = readUint16(buffer, offset, true)
                const element = readUint16(buffer, offset + 2, true)
                const tagKey = `${group.toString(16).padStart(4, '0')},${element.toString(16).padStart(4, '0')}`
                
                let tagFound = false
                
                // 중요 태그 찾기
                for (const [key, tag] of Object.entries(importantTags)) {
                  if (tag.group === group && tag.element === element && !foundTags.has(tagKey)) {
                    foundTags.add(tagKey)
                    tagFound = true
                    offset += 4
                    
                    // VR (Value Representation) 읽기
                    if (offset + 2 > buffer.length) break
                    let vr = readString(buffer, offset, 2)
                    offset += 2
                    
                    // 길이 읽기
                    let length: number
                    if (vr === 'OB' || vr === 'OW' || vr === 'OF' || vr === 'SQ' || vr === 'UT' || vr === 'UN') {
                      if (offset + 6 > buffer.length) break
                      offset += 2 // reserved
                      length = readUint32(buffer, offset, true)
                      offset += 4
                    } else {
                      if (offset + 2 > buffer.length) break
                      length = readUint16(buffer, offset, true)
                      offset += 2
                    }
                    
                    // 값 읽기 (길이 제한)
                    if (length > 0 && length < 5000 && offset + length <= buffer.length) {
                      let value: any
                      
                      if (vr === 'US' || vr === 'SS') {
                        if (length >= 2) {
                          value = readUint16(buffer, offset, true)
                        }
                      } else if (vr === 'UL' || vr === 'SL') {
                        if (length >= 4) {
                          value = readUint32(buffer, offset, true)
                        }
                      } else {
                        // 문자열 타입 (최대 200자로 제한)
                        const maxLength = Math.min(length, 200)
                        value = readString(buffer, offset, maxLength)
                      }
                      
                      if (value !== undefined && value !== null && value !== '') {
                        dicomData.metadata[tag.name] = value
                      }
                    }
                    
                    offset += length
                    consecutiveMisses = 0 // 태그를 찾았으므로 리셋
                    break
                  }
                }
                
                if (!tagFound) {
                  consecutiveMisses++
                  // 태그를 찾지 못한 경우 다음 태그로 이동
                  // DICOM 구조상 태그는 연속되어 있으므로 4바이트씩 이동
                  offset += 4
                  
                  // 유효하지 않은 위치면 중단
                  if (offset + 2 > buffer.length) break
                  const nextGroup = readUint16(buffer, offset, true)
                  if (nextGroup < 0x0000 || nextGroup > 0xFFFF) {
                    break
                  }
                }
              }
            } catch (parseError) {
              // 파싱 중 오류가 발생해도 찾은 태그는 유지
              console.warn("[Preview] DICOM 파싱 중 일부 오류 발생:", parseError)
            }
          } else {
            dicomData.metadata = {
              fileSize: buffer.length,
              isValidDicom: false,
              note: "DICM 태그를 찾을 수 없습니다",
            }
          }
        } else {
          dicomData.metadata = {
            fileSize: buffer.length,
            isValidDicom: false,
            note: "파일이 너무 작습니다",
          }
        }

        return NextResponse.json(dicomData)
      } catch (error) {
        console.error("[Preview] Error parsing DICOM:", error)
        return NextResponse.json(
          { error: "Failed to parse DICOM file", details: error instanceof Error ? error.message : String(error) },
          { status: 500 }
        )
      }
    } else if (isPDF) {
      // PDF는 이미 iframe으로 표시되므로 여기서는 기본 정보만 반환
      return NextResponse.json({
        type: "pdf",
        message: "PDF 파일은 미리보기 URL을 사용하세요",
      })
    } else if (isNIFTI) {
      // NIFTI 파일 처리 - 기본 정보만 반환
      try {
        const niftiData: {
          type: string;
          metadata: {
            fileSize: number;
            fileName: string;
            fileExtension: string;
            note: string;
            isValidNifti?: boolean;
            dimensions?: number[];
            datatype?: number;
            pixelDimensions?: number[];
          };
        } = {
          type: "nifti",
          metadata: {
            fileSize: buffer.length,
            fileName: key.split('/').pop() || key,
            fileExtension: fileExtension || 'unknown',
            note: "NIFTI 파일은 3D 뷰어에서 확인하세요",
          },
        }

        // NIFTI 헤더 기본 정보 추출 시도 (옵션)
        // NIFTI 파일은 바이너리 형식이므로 간단한 헤더 정보만 추출
        if (buffer.length >= 348) {
          // NIFTI-1 헤더는 최소 348바이트
          try {
            // sizeof_hdr (4 bytes) - 헤더 크기
            const sizeof_hdr = buffer.readUInt32LE(0)
            if (sizeof_hdr === 348) {
              niftiData.metadata.isValidNifti = true
              // dim[0] (2 bytes) - 차원 수
              const dim0 = buffer.readUInt16LE(40)
              // dim[1-7] (각 2 bytes) - 각 차원의 크기
              const dims: number[] = []
              for (let i = 0; i < Math.min(dim0, 7); i++) {
                dims.push(buffer.readUInt16LE(42 + i * 2))
              }
              if (dims.length > 0) {
                niftiData.metadata.dimensions = dims
              }
              // datatype (2 bytes)
              const datatype = buffer.readUInt16LE(70)
              niftiData.metadata.datatype = datatype
              // pixdim[1-7] (각 4 bytes) - 각 차원의 픽셀 크기
              const pixdims: number[] = []
              for (let i = 0; i < Math.min(dim0, 7); i++) {
                pixdims.push(buffer.readFloatLE(76 + i * 4))
              }
              if (pixdims.length > 0) {
                niftiData.metadata.pixelDimensions = pixdims
              }
            }
          } catch (headerError) {
            // 헤더 파싱 실패해도 기본 정보는 반환
            console.warn("[Preview] NIFTI 헤더 파싱 중 오류:", headerError)
          }
        }

        return NextResponse.json(niftiData)
      } catch (error) {
        console.error("[Preview] Error processing NIFTI:", error)
        return NextResponse.json(
          { error: "Failed to process NIFTI file", details: error instanceof Error ? error.message : String(error) },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 })
  } catch (error) {
    console.error("[Preview] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

