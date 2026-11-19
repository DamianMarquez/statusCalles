import type { ReportViewportQuery } from '../../reports/application/report-repository.js';
import type { ReportFeedbackSummary } from '../../reports/domain/report-feedback.js';
import type { StreetReport } from '../../reports/domain/street-report.js';
import type { StreetRoadClass } from '../domain/street-road-class.js';
import type { StoredScore } from '../domain/stored-street-score.js';
import type {
  SurfaceSource,
  RoadType,
  SpecialTreatment,
  SurfaceCondition,
  SurfaceType,
} from '../domain/road-information.js';

export interface StreetScoreReportInput {
  report: StreetReport;
  feedback: ReportFeedbackSummary;
  actorId?: string | null;
  segmentId?: string | null;
}

export interface StreetScoreStreetInput {
  id: string;
  officialName: string;
  segments: Array<{
    id: string;
    reports: StreetScoreReportInput[];
  }>;
}

export interface ConditionFeatureInput {
  id: string;
  streetId: string;
  streetName: string;
  roadClass: StreetRoadClass;
  roadInformation: {
    roadType: RoadType | null;
    surfaceType: SurfaceType | null;
    surfaceSource: SurfaceSource | null;
    surfaceCondition: SurfaceCondition | null;
    specialTreatments: SpecialTreatment[] | null;
    updatedAt: string | null;
  } | null;
  geometry: { type: 'MultiLineString' | 'LineString'; coordinates: number[][][] | number[][] };
  /** Puntaje precalculado; null cuando no hay evidencia ni señales. */
  score: StoredScore | null;
}

export interface StreetScoreRepository {
  findConditionFeatures(
    query: ReportViewportQuery,
    zoom: number,
    roadClasses: StreetRoadClass[],
  ): Promise<ConditionFeatureInput[]>;
  findStreetScore(streetId: string, asOf: Date): Promise<StreetScoreStreetInput | null>;
  findSegmentScore(
    segmentId: string,
    asOf: Date,
  ): Promise<{
    id: string;
    reports: StreetScoreReportInput[];
  } | null>;
  findSegmentScores(
    segmentIds: string[],
    asOf: Date,
  ): Promise<Array<{ id: string; reports: StreetScoreReportInput[] }>>;
}
