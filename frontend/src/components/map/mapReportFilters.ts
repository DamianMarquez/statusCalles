import {
  REPORT_SEVERITY_OPTIONS,
  REPORT_STATUS_OPTIONS,
  REPORT_TYPE_OPTIONS,
} from '../../api/reportCatalog.js';
import type { MapReportFilters, ReportPeriod } from '../../api/reportTypes.js';

const filterParams = [
  'types',
  'statuses',
  'period',
  'fromDate',
  'toDate',
  'minSeverity',
  'onlyMine',
];
const values = <T extends string>(options: readonly { value: T }[]) =>
  options.map((option) => option.value);

export function readMapReportFilters(search: string): MapReportFilters {
  const params = new URLSearchParams(search);
  const parseList = <T extends string>(value: string | null, accepted: T[]): T[] | undefined => {
    if (value === null) return undefined;
    const entries = value.split(',');
    if (entries.length === 1 && entries[0] === 'NONE') return [];
    return entries.every((entry) => accepted.includes(entry as T)) ? (entries as T[]) : undefined;
  };
  const types = parseList(params.get('types'), values(REPORT_TYPE_OPTIONS));
  const statuses = parseList(params.get('statuses'), values(REPORT_STATUS_OPTIONS));
  const severity = params.get('minSeverity');
  const period = params.get('period');
  const date = (value: string | null) =>
    value && !Number.isNaN(Date.parse(value)) ? value : undefined;
  return {
    ...(types?.length ? { types: types as MapReportFilters['types'] } : {}),
    ...(statuses?.length ? { statuses: statuses as MapReportFilters['statuses'] } : {}),
    ...(period && ['24h', '3d', '7d', '30d', '90d'].includes(period)
      ? { period: period as ReportPeriod }
      : {}),
    ...(date(params.get('fromDate')) ? { fromDate: date(params.get('fromDate')) } : {}),
    ...(date(params.get('toDate')) ? { toDate: date(params.get('toDate')) } : {}),
    ...(severity && values(REPORT_SEVERITY_OPTIONS).includes(severity as never)
      ? { minSeverity: severity as MapReportFilters['minSeverity'] }
      : {}),
    ...(params.get('onlyMine') === 'true' ? { onlyMine: true } : {}),
  };
}

export function writeMapReportFilters(filters: MapReportFilters): void {
  const url = new URL(window.location.href);
  for (const key of filterParams) url.searchParams.delete(key);
  if (filters.types !== undefined)
    url.searchParams.set('types', filters.types.length ? filters.types.join(',') : 'NONE');
  if (filters.statuses !== undefined)
    url.searchParams.set('statuses', filters.statuses.length ? filters.statuses.join(',') : 'NONE');
  if (filters.period) url.searchParams.set('period', filters.period);
  if (filters.fromDate) url.searchParams.set('fromDate', filters.fromDate);
  if (filters.toDate) url.searchParams.set('toDate', filters.toDate);
  if (filters.minSeverity) url.searchParams.set('minSeverity', filters.minSeverity);
  if (filters.onlyMine) url.searchParams.set('onlyMine', 'true');
  window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

export function filtersActiveCount(filters: MapReportFilters): number {
  return [
    filters.types !== undefined ? 1 : 0,
    filters.statuses !== undefined ? 1 : 0,
    filters.period || filters.fromDate || filters.toDate ? 1 : 0,
    filters.minSeverity ? 1 : 0,
    filters.onlyMine ? 1 : 0,
  ].reduce((sum, value) => sum + value, 0);
}
