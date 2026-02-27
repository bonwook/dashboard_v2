/**
 * 엑셀 컬럼 → 4D Flow MRI 리포트 필드 매핑
 * 
 * 엑셀 헤더명을 리포트 폼 필드 ID로 변환
 */

export const EXCEL_TO_REPORT_FIELD_MAPPING: Record<string, string> = {
  // 환자 기본 정보
  "Record ID": "pt_record_id",
  "Study ID": "pt_record_id",
  "MRN": "pt_mrn",
  "Medical Record Number": "pt_mrn",
  "Age": "pt_age",
  "나이": "pt_age",
  "Scan Date": "pt_scan_date",
  "검사 날짜": "pt_scan_date",

  // 스캐너 정보
  "Manufacturer": "scanner_manufacturer",
  "제조사": "scanner_manufacturer",
  "Model": "scanner_model",
  "Model Name": "scanner_model",
  "모델명": "scanner_model",
  "Field Strength": "scanner_field_strength",
  "Coil Type": "scanner_coil_type",

  // 4D Flow 시퀀스 정보
  "Sequence Type": "seq_sequence_type",
  "ECG Gating": "seq_ecg_gating",
  "Respiratory Compensation": "seq_respiratory_comp",
  "VENC": "seq_venc",
  "Spatial Resolution": "seq_spatial_res",
  "Temporal Resolution": "seq_temporal_res",
  "TR": "seq_tr",
  "TE": "seq_te",
  "Flip Angle": "seq_flip_angle",
  "Bandwidth": "seq_bandwidth",
  "Matrix Size": "seq_matrix_size",
  "FOV": "seq_fov",
  "Cardiac Phases": "seq_cardiac_phases",
  "Number of Cardiac Phases": "seq_cardiac_phases",
  "Scan Time": "seq_scan_time",
  "Total Scan Time": "seq_scan_time",

  // 전처리
  "Phase Correction": "preproc_phase_correction",
  "Background Phase Correction": "preproc_phase_correction",
  "Eddy Current Correction": "preproc_eddy_current",
  "Anti-aliasing": "preproc_anti_aliasing",
  "Noise Filtering": "preproc_noise_filter",
  "Velocity Unwrapping": "preproc_velocity_unwrap",

  // Segmentation
  "Segmentation Method": "seg_method",
  "AI Model": "seg_ai_model",
  "ROI Criteria": "seg_roi_criteria",
  "ROI Definition Criteria": "seg_roi_criteria",
  "Anatomic Landmark": "seg_anatomic_landmark",

  // 좌표계
  "Image Orientation": "coord_orientation",
  "Orientation": "coord_orientation",
  "Reformat": "coord_reformat",
  "Registration": "coord_registration",

  // 해부학적 구조
  "Ascending Aorta": "anat_ascending_aorta",
  "Aortic Arch": "anat_aortic_arch",
  "Descending Aorta": "anat_descending_aorta",
  "Pulmonary Artery": "anat_pulmonary_artery",
  "LV Outflow": "anat_lv_outflow",
  "LV Outflow Tract": "anat_lv_outflow",
  "Portal Vein": "anat_portal_vein",
  "Other Structures": "anat_other",
  "ROI Location": "anat_roi_location",
  "Plane Definition": "anat_plane_def",

  // Flow Metrics
  "Peak Velocity": "flow_peak_velocity",
  "Mean Velocity": "flow_mean_velocity",
  "Net Flow": "flow_net_flow",
  "Forward Flow": "flow_forward_flow",
  "Backward Flow": "flow_backward_flow",
  "Regurgitant Volume": "flow_regurgitant_vol",
  "Regurgitant Fraction": "flow_regurgitant_frac",
  "Stroke Volume": "flow_stroke_vol",
  "Cardiac Output": "flow_cardiac_output",

  // WSS
  "Peak WSS": "wss_peak",
  "Mean WSS": "wss_mean",
  "Regional WSS": "wss_regional_dist",
  "Regional WSS Distribution": "wss_regional_dist",
  "OSI": "wss_osi",
  "Oscillatory Shear Index": "wss_osi",

  // Energetics
  "TKE": "energy_tke",
  "Turbulent Kinetic Energy": "energy_tke",
  "Energy Loss": "energy_loss",
  "Viscous Dissipation": "energy_viscous_diss",

  // Helicity / Vorticity
  "Helicity Density": "hel_density",
  "Vorticity Magnitude": "hel_vorticity_mag",
  "Flow Eccentricity": "hel_flow_eccent",
  "Rotational Flow": "hel_rotation_grade",
  "Rotational Flow Grading": "hel_rotation_grade",

  // Pressure Gradient
  "Pressure Difference": "press_delta_p",
  "ΔP": "press_delta_p",
  "Delta P": "press_delta_p",

  // 시각화
  "Velocity Map": "viz_velocity_map",
  "Velocity Magnitude Map": "viz_velocity_map",
  "Vector Field": "viz_vector_field",
  "Vector Field Map": "viz_vector_field",
  "Streamline": "viz_streamline",
  "Streamline Image": "viz_streamline",
  "Pathline": "viz_pathline",
  "Pathline Image": "viz_pathline",
  "Cine Snapshot": "viz_cine_snapshot",
  "Cine Image Snapshot": "viz_cine_snapshot",
  "Time-Flow Curve": "viz_time_flow_curve",
  "WSS Surface": "viz_wss_surface",
  "WSS Surface Map": "viz_wss_surface",
  "TKE Map": "viz_tke_map",
  "Scale Bar": "viz_scale_bar",
  "Visualization Notes": "viz_notes",

  // 심장 주기
  "Cardiac Phase": "card_analyzed_phase",
  "Analyzed Cardiac Phase": "card_analyzed_phase",
  "Peak Systole": "card_peak_systole",
  "End Diastole": "card_end_diastole",
  "R-R Interval": "card_rr_interval",
  "Phase Averaging": "card_phase_avg",

  // 품질 관리
  "Motion Artifact": "qc_motion_artifact",
  "Phase Wrapping": "qc_phase_wrapping",
  "Signal Dropout": "qc_signal_dropout",
  "Velocity Aliasing": "qc_velocity_aliasing",
  "Segmentation Reproducibility": "qc_seg_reproducibility",
  "QC Score": "qc_score",
  "QC Notes": "qc_notes",

  // 임상적 해석
  "Normal Range": "clin_normal_range",
  "Comparison with Normal Range": "clin_normal_range",
  "Abnormal Findings": "clin_abnormal_findings",
  "Turbulence": "clin_turbulence",
  "Turbulence Present": "clin_turbulence",
  "Asymmetric Flow": "clin_asymmetric_flow",
  "Pathological Significance": "clin_pathology_meaning",
  "Clinical Recommendations": "clin_recommendations",

  // 메타데이터
  "Completion Status": "meta_completion_status",
  "Form Completion Status": "meta_completion_status",
  "Report Date": "meta_report_date",
  "Analyst": "meta_analyst",
  "Analyst Name": "meta_analyst",
  "Reviewer": "meta_reviewer",
  "Reviewer Name": "meta_reviewer",
  "Software": "meta_software_name",
  "Analysis Software": "meta_software_name",
  "Software Version": "meta_software_version",
  "Notes": "meta_notes",
  "Additional Notes": "meta_notes",
}

/**
 * 엑셀 헤더명으로부터 리포트 필드 ID를 찾음
 * 대소문자 무시, 공백/특수문자 정규화
 */
export function findReportFieldId(excelHeader: string): string | null {
  // 정확히 매칭되는 것 우선 검색
  if (EXCEL_TO_REPORT_FIELD_MAPPING[excelHeader]) {
    return EXCEL_TO_REPORT_FIELD_MAPPING[excelHeader]
  }

  // 정규화하여 검색 (대소문자, 공백, 특수문자 무시)
  const normalizedHeader = excelHeader
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, "")

  for (const [key, value] of Object.entries(EXCEL_TO_REPORT_FIELD_MAPPING)) {
    const normalizedKey = key
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]/g, "")
    
    if (normalizedKey === normalizedHeader) {
      return value
    }
  }

  return null
}

/**
 * 엑셀 데이터 행을 리포트 폼 데이터로 변환
 */
export function mapExcelRowToReportData(
  row: Record<string, string | number>,
  headers: string[]
): Record<string, string | number | undefined> {
  const reportData: Record<string, string | number | undefined> = {}

  for (const header of headers) {
    const fieldId = findReportFieldId(header)
    if (fieldId) {
      const value = row[header]
      // 빈 값이 아닌 경우만 추가
      if (value !== undefined && value !== null && value !== "") {
        reportData[fieldId] = value
      }
    }
  }

  return reportData
}
