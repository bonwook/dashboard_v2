import type { ReportSection } from "./types"

/** Yes/No 옵션 */
const yesNoOptions = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
]

/** Field Strength */
const fieldStrengthOptions = [
  { value: "1.5T", label: "1.5T" },
  { value: "3T", label: "3T" },
]

/** Manufacturer */
const manufacturerOptions = [
  { value: "siemens", label: "Siemens Healthineers" },
  { value: "ge", label: "GE HealthCare" },
  { value: "philips", label: "Philips" },
  { value: "canon", label: "Canon Medical" },
  { value: "other", label: "Other" },
]

/** ECG Gating */
const ecgGatingOptions = [
  { value: "prospective", label: "Prospective" },
  { value: "retrospective", label: "Retrospective" },
]

/** Segmentation Method */
const segmentationOptions = [
  { value: "manual", label: "Manual" },
  { value: "semi_auto", label: "Semi-automatic" },
  { value: "ai", label: "AI-based" },
]

/** Image Orientation */
const orientationOptions = [
  { value: "RAS", label: "RAS" },
  { value: "LPS", label: "LPS" },
  { value: "other", label: "Other" },
]

/** Quality Control Score */
const qcScoreOptions = [
  { value: "excellent", label: "Excellent" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
]

/** 폼 완료 상태 */
const completionStatusOptions = [
  { value: "incomplete", label: "Incomplete" },
  { value: "unverified", label: "Unverified" },
  { value: "complete", label: "Complete" },
]

/** 4D Flow MRI 전용 리포트 폼 섹션 및 필드 정의 */
export const reportFormSections: ReportSection[] = [
  {
    id: "patient_basic",
    title: "환자 기본 정보 (Patient Information)",
    description: "환자 식별 및 기본 정보",
    fields: [
      { id: "pt_record_id", label: "Record ID / Study ID", type: "text", identifier: true },
      { id: "pt_mrn", label: "Medical Record Number (MRN)", type: "text", identifier: true },
      { id: "pt_age", label: "Age (나이)", type: "number", min: 0, max: 150, unit: "세" },
      { id: "pt_scan_date", label: "Scan Date (검사 날짜)", type: "date" },
    ],
  },
  {
    id: "scanner_info",
    title: "스캐너 정보 (Scanner Information)",
    description: "MRI 장비 및 제조사 정보",
    fields: [
      { id: "scanner_manufacturer", label: "Manufacturer (제조사)", type: "select", options: manufacturerOptions },
      { id: "scanner_model", label: "Model Name (모델명)", type: "text" },
      { id: "scanner_field_strength", label: "Field Strength", type: "select", options: fieldStrengthOptions },
      { id: "scanner_coil_type", label: "Coil Type", type: "text", placeholder: "e.g., 32-channel cardiac coil" },
    ],
  },
  {
    id: "sequence_info",
    title: "4D Flow 시퀀스 정보 (Sequence Parameters)",
    description: "촬영 프로토콜 및 파라미터",
    fields: [
      { id: "seq_sequence_type", label: "Sequence Type", type: "text", placeholder: "e.g., time-resolved 3D phase contrast" },
      { id: "seq_ecg_gating", label: "ECG Gating", type: "select", options: ecgGatingOptions },
      { id: "seq_respiratory_comp", label: "Respiratory Compensation", type: "select", options: yesNoOptions },
      { id: "seq_venc", label: "VENC", type: "number", min: 0, unit: "cm/s" },
      { id: "seq_spatial_res", label: "Spatial Resolution", type: "text", placeholder: "e.g., 2.5x2.5x2.5", unit: "mm³" },
      { id: "seq_temporal_res", label: "Temporal Resolution", type: "number", min: 0, unit: "ms" },
      { id: "seq_tr", label: "TR (Repetition Time)", type: "number", min: 0, unit: "ms" },
      { id: "seq_te", label: "TE (Echo Time)", type: "number", min: 0, unit: "ms" },
      { id: "seq_flip_angle", label: "Flip Angle", type: "number", min: 0, max: 180, unit: "°" },
      { id: "seq_bandwidth", label: "Bandwidth", type: "number", min: 0, unit: "Hz/pixel" },
      { id: "seq_matrix_size", label: "Matrix Size", type: "text", placeholder: "e.g., 192x192x60" },
      { id: "seq_fov", label: "FOV (Field of View)", type: "text", placeholder: "e.g., 300x300x120", unit: "mm" },
      { id: "seq_cardiac_phases", label: "Number of Cardiac Phases", type: "number", min: 1 },
      { id: "seq_scan_time", label: "Total Scan Time", type: "number", min: 0, unit: "min" },
    ],
  },
  {
    id: "preprocessing",
    title: "전처리 (Preprocessing)",
    description: "데이터 전처리 및 보정 방법",
    fields: [
      { id: "preproc_phase_correction", label: "Background Phase Correction Method", type: "text" },
      { id: "preproc_eddy_current", label: "Eddy Current Correction", type: "select", options: yesNoOptions },
      { id: "preproc_anti_aliasing", label: "Anti-aliasing", type: "select", options: yesNoOptions },
      { id: "preproc_noise_filter", label: "Noise Filtering Method", type: "text" },
      { id: "preproc_velocity_unwrap", label: "Velocity Unwrapping", type: "select", options: yesNoOptions },
    ],
  },
  {
    id: "segmentation",
    title: "Segmentation",
    description: "ROI 정의 및 분할 방법",
    fields: [
      { id: "seg_method", label: "Segmentation Method", type: "select", options: segmentationOptions },
      { id: "seg_ai_model", label: "AI Model Name (if AI-based)", type: "text" },
      { id: "seg_roi_criteria", label: "ROI Definition Criteria", type: "text" },
      { id: "seg_anatomic_landmark", label: "Anatomic Landmark Method", type: "text" },
    ],
  },
  {
    id: "coordinate",
    title: "좌표계 정보 (Coordinate System)",
    description: "이미지 방향 및 변환 정보",
    fields: [
      { id: "coord_orientation", label: "Image Orientation", type: "select", options: orientationOptions },
      { id: "coord_reformat", label: "Reformat Applied", type: "select", options: yesNoOptions },
      { id: "coord_registration", label: "Registration Performed", type: "select", options: yesNoOptions },
    ],
  },
  {
    id: "anatomy",
    title: "해부학적 구조 정의 (Anatomical Structure)",
    description: "분석 대상 혈관 및 구조",
    fields: [
      { id: "anat_ascending_aorta", label: "Ascending Aorta", type: "select", options: yesNoOptions },
      { id: "anat_aortic_arch", label: "Aortic Arch", type: "select", options: yesNoOptions },
      { id: "anat_descending_aorta", label: "Descending Aorta", type: "select", options: yesNoOptions },
      { id: "anat_pulmonary_artery", label: "Pulmonary Artery", type: "select", options: yesNoOptions },
      { id: "anat_lv_outflow", label: "LV Outflow Tract", type: "select", options: yesNoOptions },
      { id: "anat_portal_vein", label: "Portal Vein", type: "select", options: yesNoOptions },
      { id: "anat_other", label: "Other Structures", type: "text" },
      { id: "anat_roi_location", label: "ROI Location Description", type: "textarea" },
      { id: "anat_plane_def", label: "Plane Definition Method", type: "text", placeholder: "orthogonal / centerline-based" },
    ],
  },
  {
    id: "flow_metrics",
    title: "Flow Metrics",
    description: "혈류 정량 측정값",
    fields: [
      { id: "flow_peak_velocity", label: "Peak Velocity", type: "number", min: 0, unit: "cm/s" },
      { id: "flow_mean_velocity", label: "Mean Velocity", type: "number", min: 0, unit: "cm/s" },
      { id: "flow_net_flow", label: "Net Flow", type: "number", unit: "mL/beat" },
      { id: "flow_forward_flow", label: "Forward Flow", type: "number", unit: "mL/beat" },
      { id: "flow_backward_flow", label: "Backward Flow", type: "number", unit: "mL/beat" },
      { id: "flow_regurgitant_vol", label: "Regurgitant Volume", type: "number", unit: "mL" },
      { id: "flow_regurgitant_frac", label: "Regurgitant Fraction", type: "number", min: 0, max: 100, unit: "%" },
      { id: "flow_stroke_vol", label: "Stroke Volume", type: "number", unit: "mL" },
      { id: "flow_cardiac_output", label: "Cardiac Output", type: "number", min: 0, unit: "L/min" },
    ],
  },
  {
    id: "wss",
    title: "Wall Shear Stress (WSS)",
    description: "혈관벽 전단응력 측정",
    fields: [
      { id: "wss_peak", label: "Peak WSS", type: "number", min: 0, unit: "Pa" },
      { id: "wss_mean", label: "Mean WSS", type: "number", min: 0, unit: "Pa" },
      { id: "wss_regional_dist", label: "Regional WSS Distribution", type: "text" },
      { id: "wss_osi", label: "Oscillatory Shear Index (OSI)", type: "number", min: 0, max: 1 },
    ],
  },
  {
    id: "energetics",
    title: "Energetics",
    description: "에너지 손실 및 난류 측정",
    fields: [
      { id: "energy_tke", label: "Turbulent Kinetic Energy (TKE)", type: "number", min: 0, unit: "J/m³" },
      { id: "energy_loss", label: "Energy Loss", type: "number", unit: "mW" },
      { id: "energy_viscous_diss", label: "Viscous Dissipation", type: "number", unit: "mW" },
    ],
  },
  {
    id: "helicity",
    title: "Helicity / Vorticity",
    description: "나선형 및 와류 흐름 분석",
    fields: [
      { id: "hel_density", label: "Helicity Density", type: "number", unit: "m/s²" },
      { id: "hel_vorticity_mag", label: "Vorticity Magnitude", type: "number", unit: "1/s" },
      { id: "hel_flow_eccent", label: "Flow Eccentricity", type: "number", min: 0, max: 1 },
      { id: "hel_rotation_grade", label: "Rotational Flow Grading", type: "text" },
    ],
  },
  {
    id: "pressure",
    title: "Pressure Gradient (Optional)",
    description: "압력차 추정값",
    fields: [
      { id: "press_delta_p", label: "Estimated Pressure Difference (ΔP)", type: "number", unit: "mmHg" },
    ],
  },
  {
    id: "visualization",
    title: "시각화 자료 (Visualization)",
    description: "리포트에 포함된 이미지 및 그래프",
    fields: [
      { id: "viz_velocity_map", label: "Velocity Magnitude Map", type: "select", options: yesNoOptions },
      { id: "viz_vector_field", label: "Vector Field Map", type: "select", options: yesNoOptions },
      { id: "viz_streamline", label: "Streamline Image", type: "select", options: yesNoOptions },
      { id: "viz_pathline", label: "Pathline Image", type: "select", options: yesNoOptions },
      { id: "viz_cine_snapshot", label: "Cine Image Snapshot", type: "select", options: yesNoOptions },
      { id: "viz_time_flow_curve", label: "Time-Flow Curve", type: "select", options: yesNoOptions },
      { id: "viz_wss_surface", label: "WSS Surface Map", type: "select", options: yesNoOptions },
      { id: "viz_tke_map", label: "TKE Map", type: "select", options: yesNoOptions },
      { id: "viz_scale_bar", label: "Scale Bar Included", type: "select", options: yesNoOptions },
      { id: "viz_notes", label: "Visualization Notes", type: "textarea" },
    ],
  },
  {
    id: "cardiac_cycle",
    title: "심장 주기 분석 (Cardiac Cycle)",
    description: "심장 주기 타이밍 및 평균화",
    fields: [
      { id: "card_analyzed_phase", label: "Analyzed Cardiac Phase", type: "text" },
      { id: "card_peak_systole", label: "Peak Systole Timepoint", type: "number", unit: "ms" },
      { id: "card_end_diastole", label: "End-Diastole Timepoint", type: "number", unit: "ms" },
      { id: "card_rr_interval", label: "R-R Interval", type: "number", unit: "ms" },
      { id: "card_phase_avg", label: "Phase Averaging Applied", type: "select", options: yesNoOptions },
    ],
  },
  {
    id: "quality_control",
    title: "품질 관리 (Quality Control)",
    description: "데이터 품질 평가",
    fields: [
      { id: "qc_motion_artifact", label: "Motion Artifact", type: "select", options: yesNoOptions },
      { id: "qc_phase_wrapping", label: "Phase Wrapping", type: "select", options: yesNoOptions },
      { id: "qc_signal_dropout", label: "Signal Dropout", type: "select", options: yesNoOptions },
      { id: "qc_velocity_aliasing", label: "Velocity Aliasing", type: "select", options: yesNoOptions },
      { id: "qc_seg_reproducibility", label: "Segmentation Reproducibility", type: "text" },
      { id: "qc_score", label: "QC Score", type: "select", options: qcScoreOptions },
      { id: "qc_notes", label: "QC Notes", type: "textarea" },
    ],
  },
  {
    id: "clinical_interpretation",
    title: "임상적 해석 (Clinical Interpretation)",
    description: "소견 및 병리학적 의미",
    fields: [
      { id: "clin_normal_range", label: "Comparison with Normal Range", type: "textarea" },
      { id: "clin_abnormal_findings", label: "Abnormal Findings", type: "textarea" },
      { id: "clin_turbulence", label: "Turbulence Present", type: "select", options: yesNoOptions },
      { id: "clin_asymmetric_flow", label: "Asymmetric Flow", type: "select", options: yesNoOptions },
      { id: "clin_pathology_meaning", label: "Pathological Significance", type: "textarea" },
      { id: "clin_recommendations", label: "Clinical Recommendations", type: "textarea" },
    ],
  },
  {
    id: "metadata",
    title: "메타데이터 (Metadata)",
    description: "리포트 작성 및 관리 정보",
    fields: [
      { id: "meta_completion_status", label: "Form Completion Status", type: "select", options: completionStatusOptions },
      { id: "meta_report_date", label: "Report Date", type: "date" },
      { id: "meta_analyst", label: "Analyst Name", type: "text" },
      { id: "meta_reviewer", label: "Reviewer Name", type: "text" },
      { id: "meta_software_name", label: "Analysis Software Name", type: "text" },
      { id: "meta_software_version", label: "Software Version", type: "text" },
      { id: "meta_notes", label: "Additional Notes", type: "textarea" },
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
