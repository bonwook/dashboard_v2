import type { ReportSection } from "./types"

/** 성별 코딩: 0=Male, 1=Female (또는 1/2/3) */
const genderOptions = [
  { value: "0", label: "Male" },
  { value: "1", label: "Female" },
  { value: "2", label: "Other" },
]

/** Yes/No 코딩: 0=No, 1=Yes */
const yesNoOptions = [
  { value: "0", label: "No" },
  { value: "1", label: "Yes" },
  { value: "7777", label: "Don't know" },
  { value: "8888", label: "Refused" },
  { value: "9999", label: "Missing" },
]

/** 결혼 상태 */
const maritalOptions = [
  { value: "1", label: "Single" },
  { value: "2", label: "Married" },
  { value: "3", label: "Divorced" },
  { value: "4", label: "Widowed" },
  { value: "5", label: "Other" },
]

/** 방문 유형 */
const encounterTypeOptions = [
  { value: "inpatient", label: "Inpatient (입원)" },
  { value: "outpatient", label: "Outpatient (외래)" },
  { value: "emergency", label: "Emergency (응급)" },
  { value: "telemedicine", label: "Telemedicine (원격진료)" },
]

/** 약물 상태 */
const medicationStatusOptions = [
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On-hold" },
  { value: "stopped", label: "Stopped" },
]

/** 중증도 */
const severityOptions = [
  { value: "mild", label: "Mild" },
  { value: "moderate", label: "Moderate" },
  { value: "severe", label: "Severe" },
]

/** 폼 완료 상태 */
const completionStatusOptions = [
  { value: "incomplete", label: "Incomplete" },
  { value: "unverified", label: "Unverified" },
  { value: "complete", label: "Complete" },
]

/** 예약 상태 */
const appointmentStatusOptions = [
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No-show" },
]

/** REDCap 스타일 의료 리포트 폼 섹션 및 필드 정의 */
export const reportFormSections: ReportSection[] = [
  {
    id: "patient_id",
    title: "환자 식별 정보 (Patient Identification)",
    description: "레코드·MRN·성명·생년월일·성별 등",
    fields: [
      { id: "pt_record_id", label: "Record ID / Study ID", type: "text", placeholder: "자동 번호 또는 사용자 지정" },
      { id: "pt_mrn", label: "Medical Record Number (MRN)", type: "text", identifier: true },
      { id: "pt_patient_name", label: "Patient Name (성명)", type: "text", identifier: true },
      { id: "pt_first_name", label: "First Name (이름)", type: "text", identifier: true },
      { id: "pt_last_name", label: "Last Name (성)", type: "text", identifier: true },
      { id: "pt_middle_initial", label: "Middle Initial (중간 이니셜)", type: "text", identifier: true },
      { id: "pt_dob", label: "Date of Birth (생년월일)", type: "date", identifier: true },
      { id: "pt_age", label: "Age (나이)", type: "number", min: 0, max: 150, unit: "세" },
      { id: "pt_gender", label: "Gender / Sex at Birth (성별)", type: "select", options: genderOptions },
    ],
  },
  {
    id: "demographics",
    title: "인구통계학적 정보 (Demographics)",
    fields: [
      { id: "demo_street", label: "Street Address", type: "text", identifier: true },
      { id: "demo_city", label: "City", type: "text", identifier: true },
      { id: "demo_state", label: "State", type: "text", identifier: true },
      { id: "demo_postal", label: "Postal Code / ZIP Code", type: "text", identifier: true },
      { id: "demo_country", label: "Country", type: "text", identifier: true },
      { id: "demo_home_phone", label: "Home Phone Number", type: "phone", identifier: true },
      { id: "demo_mobile_phone", label: "Mobile Phone Number", type: "phone", identifier: true },
      { id: "demo_email", label: "Email Address", type: "email", identifier: true },
      { id: "demo_fax", label: "Fax Number", type: "phone", identifier: true },
      { id: "demo_race", label: "Race (인종)", type: "text", placeholder: "범주형" },
      { id: "demo_ethnicity", label: "Ethnicity (민족성)", type: "text", placeholder: "범주형" },
      { id: "demo_marital_status", label: "Marital Status (결혼 상태)", type: "select", options: maritalOptions },
      { id: "demo_insurance", label: "Insurance Coverage (보험 정보)", type: "text" },
      { id: "demo_primary_language", label: "Primary Language (주 사용 언어)", type: "text" },
    ],
  },
  {
    id: "vitals",
    title: "생체 측정 정보 (Vital Signs)",
    fields: [
      { id: "vitals_height", label: "Height (키)", type: "number", min: 0, max: 250, unit: "cm" },
      { id: "vitals_weight", label: "Weight (체중)", type: "number", min: 0, max: 500, unit: "kg" },
      { id: "vitals_bmi", label: "BMI (체질량지수)", type: "number", min: 0, max: 100, unit: "" },
      { id: "vitals_bp_systolic", label: "Blood Pressure - Systolic (수축기)", type: "number", min: 60, max: 250 },
      { id: "vitals_bp_diastolic", label: "Blood Pressure - Diastolic (이완기)", type: "number", min: 40, max: 150 },
      { id: "vitals_heart_rate", label: "Heart Rate / Pulse (심박수)", type: "number", min: 40, max: 200, unit: "bpm" },
      { id: "vitals_respiratory_rate", label: "Respiratory Rate (호흡수)", type: "number", min: 10, max: 40, unit: "/min" },
      { id: "vitals_temperature", label: "Temperature (체온)", type: "number", min: 35, max: 42, unit: "°C" },
      { id: "vitals_spo2", label: "Oxygen Saturation (SpO2)", type: "number", min: 0, max: 100, unit: "%" },
      { id: "vitals_pain_score", label: "Pain Score (통증 점수 0-10)", type: "number", min: 0, max: 10 },
    ],
  },
  {
    id: "clinical",
    title: "임상 정보 (Clinical Information)",
    fields: [
      { id: "clinical_chief_complaint", label: "Chief Complaint (주 호소)", type: "textarea" },
      { id: "clinical_reason_visit", label: "Reason for Visit (방문 사유)", type: "text" },
      { id: "clinical_primary_dx", label: "Primary Diagnosis (진단명)", type: "text" },
      { id: "clinical_secondary_dx", label: "Secondary Diagnosis", type: "text" },
      { id: "clinical_icd10", label: "ICD-10 Code", type: "text" },
      { id: "clinical_past_medical", label: "Past Medical History (병력)", type: "textarea" },
      { id: "clinical_surgical", label: "Surgical History (수술력)", type: "textarea" },
      { id: "clinical_family", label: "Family History (가족력)", type: "textarea" },
      { id: "clinical_med_name", label: "Current Medication - Name", type: "text" },
      { id: "clinical_med_dose", label: "Dose", type: "text" },
      { id: "clinical_med_frequency", label: "Frequency", type: "text" },
      { id: "clinical_med_route", label: "Route", type: "text" },
      { id: "clinical_med_start_date", label: "Start Date", type: "date" },
      { id: "clinical_med_status", label: "Status", type: "select", options: medicationStatusOptions },
      { id: "clinical_allergen", label: "Allergies - Allergen", type: "text" },
      { id: "clinical_allergy_reaction", label: "Reaction Type", type: "text" },
      { id: "clinical_allergy_severity", label: "Severity", type: "select", options: severityOptions },
    ],
  },
  {
    id: "lab",
    title: "검사 결과 (Laboratory Results)",
    fields: [
      { id: "lab_test_name", label: "Lab Test Name (검사명)", type: "text" },
      { id: "lab_test_datetime", label: "Test Date/Time (검사 일시)", type: "date" },
      { id: "lab_result_value", label: "Result Value (결과값)", type: "text" },
      { id: "lab_unit", label: "Unit (단위)", type: "text" },
      { id: "lab_ref_range", label: "Reference Range (참고 범위)", type: "text" },
      { id: "lab_abnormal_flag", label: "Abnormal Flag (High/Low/Normal)", type: "select", options: [{ value: "high", label: "High" }, { value: "low", label: "Low" }, { value: "normal", label: "Normal" }] },
      { id: "lab_wbc", label: "WBC (백혈구)", type: "text" },
      { id: "lab_rbc", label: "RBC (적혈구)", type: "text" },
      { id: "lab_hemoglobin", label: "Hemoglobin (혈색소)", type: "text" },
      { id: "lab_hematocrit", label: "Hematocrit (적혈구용적)", type: "text" },
      { id: "lab_platelets", label: "Platelets (혈소판)", type: "text" },
      { id: "lab_glucose", label: "Glucose (혈당)", type: "text" },
      { id: "lab_creatinine", label: "Creatinine (크레아티닌)", type: "text" },
      { id: "lab_bun", label: "BUN (혈중요소질소)", type: "text" },
      { id: "lab_sodium", label: "Sodium", type: "text" },
      { id: "lab_potassium", label: "Potassium", type: "text" },
      { id: "lab_alt", label: "ALT", type: "text" },
      { id: "lab_ast", label: "AST", type: "text" },
    ],
  },
  {
    id: "imaging",
    title: "영상 검사 (Imaging/Radiology)",
    fields: [
      { id: "img_type", label: "Imaging Type (X-ray, CT, MRI 등)", type: "text" },
      { id: "img_body_part", label: "Body Part Examined (검사 부위)", type: "text" },
      { id: "img_date", label: "Date of Imaging (검사 날짜)", type: "date" },
      { id: "img_findings", label: "Findings (소견)", type: "textarea" },
      { id: "img_impression", label: "Impression (판독 의견)", type: "textarea" },
    ],
  },
  {
    id: "procedures",
    title: "시술/처치 정보 (Procedures)",
    fields: [
      { id: "proc_name", label: "Procedure Name (시술명)", type: "text" },
      { id: "proc_date", label: "Procedure Date (시술 날짜)", type: "date" },
      { id: "proc_cpt_code", label: "Procedure Code (CPT Code)", type: "text" },
      { id: "proc_provider", label: "Performing Provider (시술 의료진)", type: "text" },
      { id: "proc_outcome", label: "Outcome (결과)", type: "text" },
    ],
  },
  {
    id: "encounter",
    title: "방문 정보 (Encounter Information)",
    fields: [
      { id: "enc_id", label: "Encounter ID (방문 ID)", type: "text" },
      { id: "enc_datetime", label: "Encounter Date/Time (방문 일시)", type: "date" },
      { id: "enc_type", label: "Encounter Type (방문 유형)", type: "select", options: encounterTypeOptions },
      { id: "enc_location", label: "Location (진료 장소)", type: "text" },
      { id: "enc_attending", label: "Attending Physician (담당 의사)", type: "text" },
      { id: "enc_department", label: "Department (진료과)", type: "text" },
    ],
  },
  {
    id: "immunization",
    title: "예방접종 (Immunization)",
    fields: [
      { id: "immun_vaccine_name", label: "Vaccine Name (백신명)", type: "text" },
      { id: "immun_date", label: "Date Administered (접종 날짜)", type: "date" },
      { id: "immun_dose_number", label: "Dose Number (접종 차수)", type: "text" },
      { id: "immun_lot", label: "Lot Number (로트 번호)", type: "text" },
      { id: "immun_site", label: "Site of Administration (접종 부위)", type: "text" },
      { id: "immun_route", label: "Route (접종 경로)", type: "text" },
    ],
  },
  {
    id: "adverse",
    title: "이상 반응 (Adverse Events)",
    fields: [
      { id: "adv_event_desc", label: "Event Description (사건 설명)", type: "textarea" },
      { id: "adv_onset_date", label: "Onset Date (발생 날짜)", type: "date" },
      { id: "adv_severity", label: "Severity (중증도)", type: "select", options: severityOptions },
      { id: "adv_relationship", label: "Relationship to Study (연구 관련성)", type: "text" },
      { id: "adv_action", label: "Action Taken (조치 사항)", type: "text" },
      { id: "adv_outcome", label: "Outcome (결과)", type: "text" },
    ],
  },
  {
    id: "obstetric",
    title: "임신/산과 정보 (Obstetric)",
    fields: [
      { id: "ob_gestational_age", label: "Gestational Age at Birth (재태 연령)", type: "text" },
      { id: "ob_birth_weight", label: "Birth Weight (출생 체중)", type: "text" },
      { id: "ob_pregnancy_status", label: "Pregnancy Status (0=No, 1=Yes)", type: "select", options: yesNoOptions },
      { id: "ob_due_date", label: "Due Date (출산 예정일)", type: "date" },
    ],
  },
  {
    id: "dental",
    title: "치과 소견 (Dental Findings)",
    fields: [
      { id: "dental_exam_date", label: "Dental Examination Date (검진 날짜)", type: "date" },
      { id: "dental_findings", label: "Findings (소견)", type: "textarea" },
      { id: "dental_treatment_plan", label: "Treatment Plan (치료 계획)", type: "textarea" },
    ],
  },
  {
    id: "genomics",
    title: "유전체 정보 (Genomics)",
    fields: [
      { id: "geno_test_type", label: "Genetic Test Type (유전자 검사 유형)", type: "text" },
      { id: "geno_test_date", label: "Test Date (검사 날짜)", type: "date" },
      { id: "geno_results", label: "Results (결과)", type: "text" },
      { id: "geno_interpretation", label: "Interpretation (해석)", type: "textarea" },
    ],
  },
  {
    id: "infections",
    title: "감염 정보 (Infections)",
    fields: [
      { id: "inf_type", label: "Infection Type (감염 유형)", type: "text" },
      { id: "inf_onset_date", label: "Onset Date (발생 날짜)", type: "date" },
      { id: "inf_organism", label: "Organism (병원체)", type: "text" },
      { id: "inf_treatment", label: "Treatment (치료)", type: "text" },
    ],
  },
  {
    id: "clinical_notes",
    title: "임상 노트 (Clinical Notes)",
    fields: [
      { id: "note_type", label: "Note Type (Progress Note, Consultation 등)", type: "text" },
      { id: "note_date", label: "Note Date (작성 날짜)", type: "date" },
      { id: "note_author", label: "Author (작성자)", type: "text" },
      { id: "note_content", label: "Note Content (노트 내용)", type: "textarea" },
    ],
  },
  {
    id: "appointments",
    title: "예약 정보 (Appointments)",
    fields: [
      { id: "appt_datetime", label: "Appointment Date/Time (예약 일시)", type: "date" },
      { id: "appt_type", label: "Appointment Type (예약 유형)", type: "text" },
      { id: "appt_department", label: "Department (진료과)", type: "text" },
      { id: "appt_provider", label: "Provider (담당 의료진)", type: "text" },
      { id: "appt_status", label: "Status (상태)", type: "select", options: appointmentStatusOptions },
    ],
  },
  {
    id: "surgery",
    title: "수술 정보 (Scheduled Surgeries)",
    fields: [
      { id: "surg_name", label: "Surgery Name (수술명)", type: "text" },
      { id: "surg_datetime", label: "Scheduled Date/Time (예정 일시)", type: "date" },
      { id: "surg_surgeon", label: "Surgeon (집도의)", type: "text" },
      { id: "surg_site", label: "Surgical Site (수술 부위)", type: "text" },
      { id: "surg_preop_status", label: "Pre-op Status (수술 전 상태)", type: "text" },
    ],
  },
  {
    id: "clinical_trial",
    title: "임상시험 관련 (Clinical Trial)",
    fields: [
      { id: "trial_irb", label: "IRB Number (IRB 승인 번호)", type: "text" },
      { id: "trial_research_id", label: "Research ID (연구 ID)", type: "text" },
      { id: "trial_enrollment_date", label: "Enrollment Date (등록 날짜)", type: "date" },
      { id: "trial_study_arm", label: "Study Arm (연구군)", type: "text" },
      { id: "trial_consent_date", label: "Consent Date (동의 날짜)", type: "date" },
      { id: "trial_consent_obtained", label: "Consent Obtained (동의 여부)", type: "select", options: yesNoOptions },
      { id: "trial_consent_copy", label: "Given Copy of Consent (동의서 사본 제공)", type: "select", options: yesNoOptions },
    ],
  },
  {
    id: "devices",
    title: "장비/임플란트 (Implants/Devices)",
    fields: [
      { id: "device_name", label: "Device Name (장비명)", type: "text" },
      { id: "device_id", label: "Device ID (장비 ID)", type: "text", identifier: true },
      { id: "device_implant_date", label: "Implant Date (삽입 날짜)", type: "date" },
      { id: "device_manufacturer", label: "Manufacturer (제조사)", type: "text" },
      { id: "device_model", label: "Model Number (모델 번호)", type: "text" },
    ],
  },
  {
    id: "metadata",
    title: "메타데이터 (Metadata)",
    fields: [
      { id: "meta_completion_status", label: "Form Completion Status (폼 완료 상태)", type: "select", options: completionStatusOptions },
      { id: "meta_data_entry_date", label: "Data Entry Date (데이터 입력 날짜)", type: "date" },
      { id: "meta_data_entry_person", label: "Data Entry Person (데이터 입력자)", type: "text" },
      { id: "meta_last_modified_date", label: "Last Modified Date (마지막 수정 날짜)", type: "date" },
      { id: "meta_last_modified_by", label: "Last Modified By (마지막 수정자)", type: "text" },
      { id: "meta_record_lock", label: "Record Lock Status (레코드 잠금 상태)", type: "text" },
      { id: "meta_quality_notes", label: "Data Quality Notes (데이터 품질 노트)", type: "textarea" },
    ],
  },
]

/** 모든 필드 id 일람 (순서 유지) */
export function getAllFieldIds(): string[] {
  const ids: string[] = []
  for (const section of reportFormSections) {
    for (const field of section.fields) {
      ids.push(field.id)
    }
  }
  return ids
}

/** id로 필드 레이블 찾기 */
export function getFieldLabelById(fieldId: string): string {
  for (const section of reportFormSections) {
    const field = section.fields.find((f) => f.id === fieldId)
    if (field) return field.label
  }
  return fieldId
}
