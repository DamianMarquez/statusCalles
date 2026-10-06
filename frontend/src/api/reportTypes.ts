export type ReportType =
  'POTHOLE' | 'FLOOD' | 'ROAD_DAMAGE' | 'ROAD_BLOCKED' | 'ROAD_WORK' | 'TRAFFIC_LIGHT' | 'OTHER';

export type ReportSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ReportStatus = 'ACTIVE' | 'RESOLVED';
export type ReportFeedbackType = 'CONFIRM' | 'RESOLVED';

export interface ReportFeedbackSummary {
  confirmations: number;
  resolvedReports: number;
  userFeedback: ReportFeedbackType | null;
}

export interface ReportDto {
  id: string;
  type: ReportType;
  severity: ReportSeverity;
  description: string;
  location: {
    latitude: number;
    longitude: number;
  };
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
  feedback: ReportFeedbackSummary;
}

export interface ViewportBounds {
  south: number;
  north: number;
  west: number;
  east: number;
}

export interface CreateReportInput {
  type: ReportType;
  severity: ReportSeverity;
  description?: string;
  latitude: number;
  longitude: number;
}
