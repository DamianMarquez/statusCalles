export const REPORT_TYPES = [
  'POTHOLE',
  'FLOOD',
  'ROAD_DAMAGE',
  'ROAD_BLOCKED',
  'ROAD_WORK',
  'TRAFFIC_LIGHT',
  'OTHER',
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export const SEVERITY_LEVELS = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
} as const;

export type ReportSeverity = keyof typeof SEVERITY_LEVELS;

export const REPORT_STATUSES = ['ACTIVE', 'STALE', 'RESOLVED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface StreetReport {
  id: string;
  type: ReportType;
  severity: ReportSeverity;
  description: string;
  location: Coordinates;
  status: ReportStatus;
  createdAt: Date;
  updatedAt: Date;
  street?: {
    id: string;
    officialName: string;
    neighborhoodName: string | null;
    communeName: string | null;
  } | null;
}

export interface CreateStreetReport {
  type: ReportType;
  severity: ReportSeverity;
  description: string;
  location: Coordinates;
}
