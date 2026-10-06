import type { StreetReport } from '../domain/street-report.js';

export interface ReportDto {
  id: string;
  type: StreetReport['type'];
  severity: StreetReport['severity'];
  description: string;
  location: StreetReport['location'];
  status: StreetReport['status'];
  createdAt: string;
  updatedAt: string;
}

export function toReportDto(report: StreetReport): ReportDto {
  return {
    id: report.id,
    type: report.type,
    severity: report.severity,
    description: report.description,
    location: report.location,
    status: report.status,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  };
}
