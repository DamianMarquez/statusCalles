import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMyReports } from '../../api/reportsApi.js';
import type { OwnedReportDto } from '../../api/reportTypes.js';
import { MyReports } from './MyReports.js';

vi.mock('../../api/reportsApi.js', () => ({
  getMyReports: vi.fn(),
  submitReportFeedback: vi.fn(),
}));

const ownedReport: OwnedReportDto = {
  id: 'report-1',
  type: 'POTHOLE',
  severity: 'HIGH',
  description: 'Bache grande',
  location: { latitude: -34.6037, longitude: -58.3816 },
  status: 'ACTIVE',
  createdAt: '2026-10-05T12:00:00.000Z',
  updatedAt: '2026-10-06T12:00:00.000Z',
  street: {
    id: 'street-1',
    officialName: 'Av. Corrientes',
    neighborhoodName: 'San Nicolás',
    communeName: 'Comuna 1',
  },
  feedback: { confirmations: 8, resolvedReports: 2, userFeedback: 'CONFIRM' },
  freshness: {
    level: 'FRESH',
    confidence: 85,
    lastActivityAt: '2026-10-06T12:00:00.000Z',
    evaluatedAt: '2026-10-06T12:00:00.000Z',
  },
  publiclyVisible: true,
  feedbackCount: 10,
  latestActivityAt: '2026-10-06T12:00:00.000Z',
};

beforeEach(() =>
  vi.mocked(getMyReports).mockResolvedValue({ items: [ownedReport], hasMore: false }),
);
afterEach(() => cleanup());

describe('MyReports', () => {
  it('shows report details and opens a selected report on the map', async () => {
    const onViewMap = vi.fn();
    render(<MyReports onViewMap={onViewMap} onCreateReport={vi.fn()} />);
    expect(await screen.findByText('Av. Corrientes')).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) => element?.classList.contains('my-report-card__activity') ?? false,
      ),
    ).toHaveTextContent('8 confirmaciones · 10 respuestas');
    fireEvent.click(screen.getByRole('button', { name: 'Ver en mapa' }));
    expect(onViewMap).toHaveBeenCalledWith(ownedReport);
    fireEvent.click(screen.getByText('Ver detalle'));
    expect(screen.getByText(/-34.60370, -58.38160/)).toBeInTheDocument();
  });

  it('shows an empty state with an action to create the first report', async () => {
    vi.mocked(getMyReports).mockResolvedValue({ items: [], hasMore: false });
    const onCreateReport = vi.fn();
    render(<MyReports onViewMap={vi.fn()} onCreateReport={onCreateReport} />);
    expect(await screen.findByText('Todavía no realizaste ningún reporte.')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Crear un reporte' }));
    expect(screen.getByText('Todavía no realizaste ningún reporte.')).toBeInTheDocument();
    expect(onCreateReport).toHaveBeenCalledOnce();
  });

  it('shows and retries API errors', async () => {
    vi.mocked(getMyReports).mockRejectedValueOnce(new Error('No pudimos cargar tus reportes.'));
    render(<MyReports onViewMap={vi.fn()} onCreateReport={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar tus reportes.');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Av. Corrientes')).toBeInTheDocument();
  });
});
