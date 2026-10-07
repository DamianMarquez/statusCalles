import { useCallback, useEffect, useRef, useState } from 'react';
import { getReportsInViewport } from '../../api/reportsApi.js';
import type {
  MapReportFilters,
  ReportDto,
  ReportFeedbackSummary,
  ViewportBounds,
} from '../../api/reportTypes.js';

export type ReportLoadStatus = 'loading' | 'error' | 'empty' | 'loaded';

function normalizeBounds(bounds: ViewportBounds): ViewportBounds {
  return {
    south: Number(bounds.south.toFixed(5)),
    north: Number(bounds.north.toFixed(5)),
    west: Number(bounds.west.toFixed(5)),
    east: Number(bounds.east.toFixed(5)),
  };
}

function boundsKey(bounds: ViewportBounds): string {
  return `${bounds.south}:${bounds.north}:${bounds.west}:${bounds.east}`;
}

export function useViewportReports(debounceMs = 300) {
  const [reports, setReports] = useState<ReportDto[]>([]);
  const [status, setStatus] = useState<ReportLoadStatus>('loading');
  const [hasMore, setHasMore] = useState(false);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeController = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const lastBoundsKey = useRef<string | null>(null);
  const latestBounds = useRef<ViewportBounds | null>(null);
  const latestFilters = useRef<MapReportFilters>({});

  const requestBounds = useCallback(
    (bounds: ViewportBounds, filters: MapReportFilters = {}, force = false) => {
      const normalizedBounds = normalizeBounds(bounds);
      const normalizedFilters = {
        ...filters,
        types: filters.types ? [...filters.types].sort() : undefined,
        statuses: filters.statuses ? [...filters.statuses].sort() : undefined,
      };
      const key = `${boundsKey(normalizedBounds)}:${JSON.stringify(normalizedFilters)}`;
      if (!force && key === lastBoundsKey.current) return;

      lastBoundsKey.current = key;
      latestBounds.current = normalizedBounds;
      latestFilters.current = normalizedFilters;
      const currentRequestId = ++requestId.current;
      activeController.current?.abort();
      activeController.current = null;
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
      setStatus('loading');

      pendingTimer.current = setTimeout(async () => {
        const controller = new AbortController();
        activeController.current = controller;
        try {
          const page = await getReportsInViewport(
            normalizedBounds,
            normalizedFilters,
            controller.signal,
          );
          if (requestId.current !== currentRequestId || controller.signal.aborted) return;
          setReports(page.items);
          setHasMore(page.hasMore);
          setStatus(page.items.length === 0 ? 'empty' : 'loaded');
        } catch {
          if (requestId.current !== currentRequestId || controller.signal.aborted) return;
          setStatus('error');
        }
      }, debounceMs);
    },
    [debounceMs],
  );

  const retry = useCallback(() => {
    if (latestBounds.current) requestBounds(latestBounds.current, latestFilters.current, true);
  }, [requestBounds]);

  const addReport = useCallback((report: ReportDto) => {
    requestId.current += 1;
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    activeController.current?.abort();
    activeController.current = null;
    setReports((current) => [report, ...current.filter((item) => item.id !== report.id)]);
    setStatus('loaded');
  }, []);

  const updateReportFeedback = useCallback((reportId: string, feedback: ReportFeedbackSummary) => {
    setReports((current) =>
      current.map((report) => (report.id === reportId ? { ...report, feedback } : report)),
    );
  }, []);

  const replaceReport = useCallback((nextReport: ReportDto) => {
    setReports((current) =>
      current.map((report) => (report.id === nextReport.id ? nextReport : report)),
    );
  }, []);

  useEffect(
    () => () => {
      requestId.current += 1;
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
      activeController.current?.abort();
    },
    [],
  );

  return {
    reports,
    status,
    hasMore,
    requestBounds,
    retry,
    addReport,
    updateReportFeedback,
    replaceReport,
  };
}
