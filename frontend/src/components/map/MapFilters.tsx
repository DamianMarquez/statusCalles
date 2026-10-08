import { useCallback, useEffect, useRef, useState } from 'react';
import {
  REPORT_SEVERITY_OPTIONS,
  REPORT_STATUS_OPTIONS,
  REPORT_TYPE_OPTIONS,
} from '../../api/reportCatalog.js';
import type {
  MapReportFilters,
  ReportPeriod,
  ReportStatus,
  ReportType,
} from '../../api/reportTypes.js';
import { filtersActiveCount } from './mapReportFilters.js';

const presets: Array<{ value: ReportPeriod | 'all' | 'custom'; label: string }> = [
  { value: 'all', label: 'Todo' },
  { value: '24h', label: 'Últimas 24 horas' },
  { value: '3d', label: 'Últimos 3 días' },
  { value: '7d', label: 'Últimos 7 días' },
  { value: '30d', label: 'Últimos 30 días' },
  { value: '90d', label: 'Últimos 90 días' },
  { value: 'custom', label: 'Personalizado' },
];

function isoBoundary(date: string, end: boolean): string | undefined {
  if (!date) return undefined;
  const instant = new Date(`${date}T${end ? '23:59:59.999' : '00:00:00'}-03:00`);
  return Number.isNaN(instant.getTime()) ? undefined : instant.toISOString();
}

function localDate(value: string | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function MapFilters({
  value,
  onApply,
  authenticated,
  onRequestLogin,
}: {
  value: MapReportFilters;
  onApply: (filters: MapReportFilters) => void;
  authenticated: boolean;
  onRequestLogin: () => void;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState(value);
  const [period, setPeriod] = useState<ReportPeriod | 'all' | 'custom'>(
    value.period ?? (value.fromDate || value.toDate ? 'custom' : 'all'),
  );
  const [fromDate, setFromDate] = useState(localDate(value.fromDate));
  const [toDate, setToDate] = useState(localDate(value.toDate));
  const [dateError, setDateError] = useState('');
  const closePanel = useCallback(() => {
    setOpen(false);
    toggleRef.current?.focus();
  }, []);
  useEffect(() => {
    setDraft(value);
    setPeriod(value.period ?? (value.fromDate || value.toDate ? 'custom' : 'all'));
    setFromDate(localDate(value.fromDate));
    setToDate(localDate(value.toDate));
  }, [value]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>('button, input, select')?.focus();
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePanel();
      }
      if (event.key === 'Tab' && panelRef.current) {
        const items = [
          ...panelRef.current.querySelectorAll<HTMLElement>('button, input, select'),
        ].filter((item) => !item.hasAttribute('disabled'));
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [closePanel, open]);

  const selectedTypes = draft.types ?? REPORT_TYPE_OPTIONS.map((item) => item.value);
  const selectedStatuses = draft.statuses ?? REPORT_STATUS_OPTIONS.map((item) => item.value);
  const patchDraft = (patch: Partial<MapReportFilters>) =>
    setDraft((current) => ({ ...current, ...patch }));

  function apply() {
    if (period === 'custom' && fromDate && toDate && fromDate > toDate) {
      setDateError('La fecha inicial debe ser anterior o igual a la fecha final.');
      return;
    }
    if (draft.onlyMine && !authenticated) {
      onRequestLogin();
      return;
    }
    setDateError('');
    const next = { ...draft };
    delete next.period;
    delete next.fromDate;
    delete next.toDate;
    if (period !== 'all' && period !== 'custom') next.period = period;
    if (period === 'custom') {
      next.fromDate = isoBoundary(fromDate, false);
      next.toDate = isoBoundary(toDate, true);
    }
    onApply(next);
    closePanel();
  }

  function clear() {
    const next: MapReportFilters = {};
    setDraft(next);
    setPeriod('all');
    setFromDate('');
    setToDate('');
    setDateError('');
    onApply(next);
    closePanel();
  }

  function toggleType(type: ReportType) {
    const next = new Set(selectedTypes);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    patchDraft({
      types: next.size === REPORT_TYPE_OPTIONS.length ? undefined : [...next],
    });
  }

  function toggleStatus(status: ReportStatus) {
    const next = new Set(selectedStatuses);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    patchDraft({ statuses: next.size === REPORT_STATUS_OPTIONS.length ? undefined : [...next] });
  }

  return (
    <aside className="map-filters">
      <button
        type="button"
        className="map-filters__toggle"
        ref={toggleRef}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        ☷ Filtros{filtersActiveCount(value) > 0 ? ` (${filtersActiveCount(value)})` : ''}
      </button>
      {open && (
        <section
          ref={panelRef}
          className="map-filters__panel"
          role="dialog"
          aria-label="Filtros del mapa"
        >
          <header>
            <h2>Filtros</h2>
            <button type="button" aria-label="Cerrar filtros" onClick={closePanel}>
              ×
            </button>
          </header>
          <fieldset>
            <legend>Tipo de reporte</legend>
            <div className="map-filters__quick-actions">
              <button type="button" onClick={() => patchDraft({ types: undefined })}>
                Seleccionar todos
              </button>
              <button type="button" onClick={() => patchDraft({ types: [] })}>
                Limpiar
              </button>
            </div>
            {REPORT_TYPE_OPTIONS.map((item) => (
              <label key={item.value}>
                <input
                  type="checkbox"
                  checked={selectedTypes.includes(item.value)}
                  onChange={() => toggleType(item.value)}
                />
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Antigüedad</legend>
            <select
              aria-label="Antigüedad"
              value={period}
              onChange={(event) => setPeriod(event.target.value as typeof period)}
            >
              {presets.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
            {period === 'custom' && (
              <div className="map-filters__dates">
                <label>
                  Desde
                  <input
                    aria-label="Desde"
                    type="date"
                    value={fromDate}
                    onChange={(event) => setFromDate(event.target.value)}
                  />
                </label>
                <label>
                  Hasta
                  <input
                    aria-label="Hasta"
                    type="date"
                    value={toDate}
                    onChange={(event) => setToDate(event.target.value)}
                  />
                </label>
              </div>
            )}
          </fieldset>
          <fieldset>
            <legend>Estado</legend>
            {REPORT_STATUS_OPTIONS.map((item) => (
              <label key={item.value}>
                <input
                  type="checkbox"
                  checked={selectedStatuses.includes(item.value)}
                  onChange={() => toggleStatus(item.value)}
                />
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Severidad mínima</legend>
            <select
              aria-label="Severidad mínima"
              value={draft.minSeverity ?? ''}
              onChange={(event) =>
                patchDraft({
                  minSeverity: (event.target.value || undefined) as MapReportFilters['minSeverity'],
                })
              }
            >
              <option value="">Cualquiera</option>
              {REPORT_SEVERITY_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </fieldset>
          <label className="map-filters__mine">
            <input
              type="checkbox"
              checked={Boolean(draft.onlyMine)}
              onChange={(event) => patchDraft({ onlyMine: event.target.checked || undefined })}
            />
            Solo mis reportes
          </label>
          {draft.onlyMine && !authenticated && (
            <p>
              Iniciá sesión para filtrar tus reportes.{' '}
              <button type="button" onClick={onRequestLogin}>
                Iniciar sesión
              </button>
            </p>
          )}
          {dateError && <p role="alert">{dateError}</p>}
          <footer>
            <button type="button" onClick={clear}>
              Limpiar filtros
            </button>
            <button type="button" className="map-filters__apply" onClick={apply}>
              Aplicar
            </button>
          </footer>
        </section>
      )}
    </aside>
  );
}
