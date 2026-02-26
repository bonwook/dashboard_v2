/**
 * s3_updates.metadata (DICOM/태그 등) 키 → 의료 리포트 폼 필드 id 매핑.
 * placeholder 표시 및 수정 없을 때 자동 저장용.
 */
export const S3_METADATA_TO_FORM_FIELD: Record<string, string> = {
  PatientName: "pt_patient_name",
  "Patient Name": "pt_patient_name",
  PatientID: "pt_mrn",
  "Patient ID": "pt_mrn",
  StudyDate: "enc_datetime",
  "Study Date": "enc_datetime",
  StudyTime: "enc_datetime",
  "Study Time": "enc_datetime",
  Modality: "img_type",
  SeriesDescription: "img_findings",
  "Series Description": "img_findings",
  StudyInstanceUID: "enc_id",
  "Study Instance UID": "enc_id",
  SeriesInstanceUID: "enc_id",
  "Series Instance UID": "enc_id",
  AcquisitionTime: "lab_test_datetime",
  "Acquisition Time": "lab_test_datetime",
  ContentTime: "lab_test_datetime",
  "Content Time": "lab_test_datetime",
  Manufacturer: "device_manufacturer",
  ManufacturerModelName: "device_model",
  "Manufacturer Model Name": "device_model",
  InstanceNumber: "lab_result_value",
  "Instance Number": "lab_result_value",
  SliceThickness: "lab_result_value",
  "Slice Thickness": "lab_result_value",
  PixelSpacing: "lab_ref_range",
  "Pixel Spacing": "lab_ref_range",
  SequenceName: "img_body_part",
  "Sequence Name": "img_body_part",
}

/**
 * s3_updates metadata 객체에서 리포트 폼 placeholder용 키-값 맵 생성.
 * @param metadata DB의 metadata (JSON 객체 또는 문자열)
 */
export function buildPlaceholderFromS3Metadata(
  metadata: Record<string, unknown> | string | null | undefined
): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  if (!metadata) return out
  
  try {
    const raw = typeof metadata === "string" ? (JSON.parse(metadata || "{}") as Record<string, unknown>) : metadata
    
    for (const [key, value] of Object.entries(raw)) {
      try {
        if (value === undefined || value === null || value === "") continue
        const fieldId = S3_METADATA_TO_FORM_FIELD[key]
        if (!fieldId) continue
        
        const str = String(value).trim()
        // 값이 있고, 의미있는 내용인 경우에만 추가
        if (!str || str === "null" || str === "undefined") continue
        out[fieldId] = str
      } catch (error) {
        // 개별 값 변환 실패 시 빈 문자열로 처리
        const fieldId = S3_METADATA_TO_FORM_FIELD[key]
        if (fieldId) {
          out[fieldId] = ""
        }
      }
    }
  } catch (error) {
    // JSON 파싱 실패 등 전체 실패 시 빈 객체 반환
    console.error("Failed to parse metadata:", error)
    return {}
  }
  
  return out
}
