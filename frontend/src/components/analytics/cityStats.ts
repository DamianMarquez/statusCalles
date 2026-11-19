import type { ZoneProperties } from '../../api/zonesApi.js';
import type { ReportType } from '../../api/reportCatalog.js';
import {
  ALL_MAP_CATEGORIES,
  MAP_CATEGORIES,
  categoryOfReportType,
  type MapCategory,
} from '../map/mapCategories.js';

export interface CitySummary {
  totalKm: number;
  segments: number;
  scoredKm: number;
  /** Porcentaje de kilómetros con puntaje calculado. */
  coveragePct: number;
  surfaceKm: Record<string, number>;
  knownKm: number;
  /** Porcentaje de kilómetros con tipo de pavimento conocido. */
  knownPct: number;
  calming: number;
  calmingByType: Record<string, number>;
  publicWorks: number;
  reportedWorks: number;
  reportedCuts: number;
  critical: number;
  high: number;
  activeReports: number;
  /** Reportes activos agrupados en las categorías del mapa. */
  reportsByCategory: Record<MapCategory, number>;
}

// `source` puede faltar si el servidor todavía no se actualizó.
function add(target: Record<string, number>, source: Record<string, number> | undefined) {
  for (const [key, value] of Object.entries(source ?? {}))target[key] = (target[key] ?? 0) + value;
}

/** Suma las zonas (comunas) para obtener los totales de la ciudad entera. */
export function summarizeCity(zones: ZoneProperties[]): CitySummary {
  const summary: CitySummary = {
    totalKm: 0,
    segments: 0,
    scoredKm: 0,
    coveragePct: 0,
    surfaceKm: {},
    knownKm: 0,
    knownPct: 0,
    calming: 0,
    calmingByType: {},
    publicWorks: 0,
    reportedWorks: 0,
    reportedCuts: 0,
    critical: 0,
    high: 0,
    activeReports: 0,
    reportsByCategory: Object.fromEntries(ALL_MAP_CATEGORIES.map((item) => [item, 0])) as Record<
      MapCategory,
      number
    >,
  };
  for (const zone of zones) {
    summary.totalKm += zone.totalKm;
    summary.segments += zone.segments ?? 0;
    summary.scoredKm += zone.condition.scoredKm ?? 0;
    add(summary.surfaceKm, zone.surface.kmByType);
    summary.calming += zone.intervention.calming;
    add(summary.calmingByType, zone.intervention.calmingByType);
    summary.publicWorks += zone.intervention.publicWorks;
    summary.reportedWorks += zone.intervention.reportedWorks;
    summary.reportedCuts += zone.intervention.reportedCuts;
    summary.critical += zone.critical.critical;
    summary.high += zone.critical.high;
    summary.activeReports += zone.critical.activeReports;
    for (const [type, count] of Object.entries(zone.reportsByType ?? {})) {
      summary.reportsByCategory[categoryOfReportType(type as ReportType)] += count;
    }
  }
  summary.knownKm = Object.values(summary.surfaceKm).reduce((sum, km) => sum + km, 0);
  const percent = (part: number) =>
    summary.totalKm > 0 ? Math.round((part / summary.totalKm) * 1000) / 10 : 0;
  summary.coveragePct = percent(summary.scoredKm);
  summary.knownPct = percent(summary.knownKm);
  return summary;
}

/** Agrupa los reportes por tipo en las categorías del mapa, con su color e ícono. */
export function groupReportsByCategory(items: Array<{ type: string; count: number }>) {
  const totals = new Map<MapCategory, number>();
  for (const item of items) {
    const category = categoryOfReportType(item.type as ReportType);
    totals.set(category, (totals.get(category) ?? 0) + item.count);
  }
  return MAP_CATEGORIES.filter((category) => category.reportTypes.length > 0).map((category) => ({
    category: category.value,
    label: category.label,
    color: category.color,
    icon: category.icon,
    count: totals.get(category.value) ?? 0,
  }));
}
