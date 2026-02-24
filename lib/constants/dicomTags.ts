/**
 * DICOM important tags (app/api/storage/preview route.ts importantTags와 동일).
 * 의료 리포트 폼 S3 메타데이터 섹션에서 사용.
 */
export const DICOM_IMPORTANT_TAGS: { key: string; name: string }[] = [
  { key: "PatientName", name: "Patient Name" },
  { key: "PatientID", name: "Patient ID" },
  { key: "StudyDate", name: "Study Date" },
  { key: "StudyTime", name: "Study Time" },
  { key: "Modality", name: "Modality" },
  { key: "SequenceName", name: "Sequence Name" },
  { key: "SeriesDescription", name: "Series Description" },
  { key: "PixelSpacing", name: "Pixel Spacing" },
  { key: "SliceThickness", name: "Slice Thickness" },
  { key: "SliceLocation", name: "Slice Location" },
  { key: "InstanceNumber", name: "Instance Number" },
  { key: "AcquisitionTime", name: "Acquisition Time" },
  { key: "ContentTime", name: "Content Time" },
  { key: "TemporalPositionIdentifier", name: "Temporal Position Identifier" },
  { key: "CardiacNumberOfImages", name: "Cardiac Number of Images" },
  { key: "SamplesPerPixel", name: "Samples per Pixel" },
  { key: "Manufacturer", name: "Manufacturer" },
  { key: "ManufacturerModelName", name: "Manufacturer Model Name" },
  { key: "StudyInstanceUID", name: "Study Instance UID" },
  { key: "SeriesInstanceUID", name: "Series Instance UID" },
  { key: "SOPInstanceUID", name: "SOP Instance UID" },
]
