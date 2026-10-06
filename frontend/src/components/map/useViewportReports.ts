import { useCallback, useEffect, useRef, useState } from 'react';
import { getReportsInViewport } from '../../api/reportsApi.js';
import type { ReportDto, ReportFeedbackSummary, ViewportBounds } from '../../api/reportTypes.js';

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
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeController = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const lastBoundsKey = useRef<string | null>(null);
  const latestBounds = useRef<ViewportBounds | null>(null);

  const requestBounds = useCallback(
    (bounds: ViewportBounds, force = false) => {
      const normalizedBounds = normalizeBounds(bounds);
      const key = boundsKey(normalizedBounds);
      if (!force && key === lastBoundsKey.current) return;

      lastBoundsKey.current = key;
      latestBounds.current = normalizedBounds;
      const currentRequestId = ++requestId.current;
      activeController.current?.abort();
      activeController.current = null;
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
      setStatus('loading');

      pendingTimer.current = setTimeout(async () => {
        const controller = new AbortController();
        activeController.current = controller;
        try {
          const nextReports = await getReportsInViewport(normalizedBounds, controller.signal);
          if (requestId.current !== currentRequestId || controller.signal.aborted) return;
          setReports(nextReports);
          setStatus(nextReports.length === 0 ? 'empty' : 'loaded');
        } catch {
          if (requestId.current !== currentRequestId || controller.signal.aborted) return;
          setStatus('error');
        }
      }, debounceMs);
    },
    [debounceMs],
  );

  const retry = useCallback(() => {
    if (latestBounds.current) requestBounds(latestBounds.current, true);
  }, [requestBounds]);

  const addReport = useCallback((report: ReportDto) => {
    setReports((current) => [report, ...current.filter((item) => item.id !== report.id)]);
    setStatus('loaded');
  }, []);

  const updateReportFeedback = useCallback((reportId: string, feedback: ReportFeedbackSummary) => {
    setReports((current) =>
      current.map((report) => (report.id === reportId ? { ...report, feedback } : report)),
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

  return { reports, status, requestBounds, retry, addReport, updateReportFeedback };
}
