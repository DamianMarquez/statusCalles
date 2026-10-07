import { useEffect, useState } from 'react';
import type { MapReportFilters } from '../../api/reportTypes.js';
import { readMapReportFilters, writeMapReportFilters } from './mapReportFilters.js';

export function useMapReportFilters() {
  const [filters, setFilters] = useState<MapReportFilters>(() =>
    readMapReportFilters(window.location.search),
  );
  useEffect(() => {
    const onPopState = () => setFilters(readMapReportFilters(window.location.search));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const applyFilters = (next: MapReportFilters) => {
    writeMapReportFilters(next);
    setFilters(next);
  };
  return { filters, applyFilters };
}
