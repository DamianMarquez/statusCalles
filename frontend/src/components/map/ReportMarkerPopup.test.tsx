import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReportDto } from '../../api/reportTypes.js';
import { getStreetInfrastructure, getStreetScore } from '../../api/streetsApi.js';
import { ReportMarkerPopup } from './ReportMarkerPopup.js';

vi.mock('../../api/streetsApi.js', () => ({
  getStreetInfrastructure: vi.fn().mockResolvedValue([]),
  getStreetScore: vi.fn().mockResolvedValue(null),
}));

const report: ReportDto = {
  id: 'report-1',
  type: 'POTHOLE',
  severity: 'HIGH',
  description: 'Bache grande',
  location: { latitude: -34.6037, longitude: -58.3816 },
  status: 'STALE',
  createdAt: '2026-02-06T12:00:00.000Z',
  updatedAt: '2026-02-06T12:00:00.000Z',
  feedback: { confirmations: 1, resolvedReports: 0, userFeedback: null },
  freshness: {
    level: 'STALE',
    confidence: 12,
    lastActivityAt: '2026-02-06T12:00:00.000Z',
    evaluatedAt: '2026-10-06T12:00:00.000Z',
  },
};

const defaultProps = {
  report,
  onVote: vi.fn(),
  isVoting: false,
  feedbackError: null,
  authenticated: true,
  onRequestLogin: vi.fn(),
  popupOpen: false,
  onFlag: vi.fn(),
  flagBusy: false,
  flagError: null,
  flagSuccess: false,
};

afterEach(() => cleanup());

describe('ReportMarkerPopup freshness', () => {
  it('uses visible text as well as a neutral icon for stale reports', () => {
    render(<ReportMarkerPopup {...defaultProps} />);

    expect(screen.getByText('Antiguo')).toBeInTheDocument();
    expect(screen.getByText('Estado: Antiguo')).toBeInTheDocument();
    expect(screen.getByText('Confianza comunitaria: 12%')).toBeInTheDocument();
  });

  it('labels resolved reports with accessible status text', () => {
    render(
      <ReportMarkerPopup
        {...defaultProps}
        report={{
          ...report,
          status: 'RESOLVED',
          freshness: { ...report.freshness, level: 'RESOLVED', confidence: 0 },
        }}
      />,
    );

    expect(screen.getByText('Resuelto')).toBeInTheDocument();
    expect(screen.getByText('Estado: Resuelto')).toBeInTheDocument();
  });

  it('asks signed-out visitors to log in before voting', () => {
    const onRequestLogin = vi.fn();
    render(
      <ReportMarkerPopup {...defaultProps} authenticated={false} onRequestLogin={onRequestLogin} />,
    );

    expect(
      screen.getByRole('button', { name: /Iniciá sesión para confirmar/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sigue existiendo/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /denunciar este reporte/ })).toBeInTheDocument();
    screen.getByRole('button', { name: /Iniciá sesión para confirmar/ }).click();
    expect(onRequestLogin).toHaveBeenCalledOnce();
  });

  it('submits the selected report flag reason and displays a duplicate error', () => {
    const onFlag = vi.fn();
    render(
      <ReportMarkerPopup
        {...defaultProps}
        onFlag={onFlag}
        flagError="Ya marcaste este reporte para revisión."
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Denunciar reporte' }));
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'FALSE_INFORMATION' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar denuncia' }));
    expect(onFlag).toHaveBeenCalledWith('FALSE_INFORMATION');
    expect(screen.getByRole('alert')).toHaveTextContent('Ya marcaste este reporte para revisión.');
  });

  it('shows the official street, neighborhood, and commune when a report is associated', () => {
    render(
      <ReportMarkerPopup
        {...defaultProps}
        report={{
          ...report,
          street: {
            id: 'street-1',
            officialName: 'Av. Corrientes',
            neighborhoodName: 'Almagro',
            communeName: 'Comuna 5',
          },
        }}
      />,
    );
    expect(screen.getByText('Av. Corrientes')).toBeInTheDocument();
    expect(screen.getByText('Almagro')).toBeInTheDocument();
    expect(screen.getByText('Comuna 5')).toBeInTheDocument();
  });

  it('labels nearby official mobility infrastructure separately from community reports', async () => {
    vi.mocked(getStreetInfrastructure).mockResolvedValueOnce([
      {
        id: 'bike-lane-1',
        type: 'BIKE_LANE',
        name: 'Av. Corrientes',
        details: {},
        source: {
          name: 'Ciclovías oficiales de CABA',
          url: 'https://example.invalid',
          lastSuccessfulSync: null,
        },
      },
    ]);
    render(
      <ReportMarkerPopup
        {...defaultProps}
        popupOpen
        report={{
          ...report,
          street: {
            id: 'street-1',
            officialName: 'Av. Corrientes',
            neighborhoodName: 'Almagro',
            communeName: 'Comuna 5',
          },
        }}
      />,
    );
    expect(await screen.findByText('Infraestructura · Fuente oficial')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Ciclovía · Av. Corrientes')).toBeInTheDocument());
  });

  it('shows an explainable street score and source labels when opening a report', async () => {
    vi.mocked(getStreetScore).mockResolvedValueOnce({
      id: 'street-1',
      targetType: 'STREET',
      officialName: 'Av. Corrientes',
      score: 62,
      level: 'ACCEPTABLE',
      hasEvidence: true,
      availability: { status: 'UNKNOWN', signals: [] },
      confidence: 'MEDIUM',
      sourceStatus: {
        community: 'AVAILABLE',
        officialIncidents: 'UNAVAILABLE',
        traffic: 'UNAVAILABLE',
      },
      calculatedAt: '2026-10-06T12:00:00.000Z',
      metrics: {
        reports: 2,
        activeReports: 2,
        recentReports: 2,
        highSeverityReports: 1,
        confirmations: 12,
        resolvedReports: 0,
        officialIncidents: 0,
        trafficLevel: null,
        latestReportAt: null,
      },
      factors: [
        {
          code: 'REPORT_SEVERITY',
          source: 'COMMUNITY',
          label: 'Severidad de reportes activos',
          impact: -13,
          detail: 'Dos reportes recientes.',
        },
      ],
    });
    render(
      <ReportMarkerPopup
        {...defaultProps}
        popupOpen
        report={{
          ...report,
          street: {
            id: 'street-1',
            officialName: 'Av. Corrientes',
            neighborhoodName: 'Almagro',
            communeName: 'Comuna 5',
          },
        }}
      />,
    );
    expect(await screen.findByText('Estado estimado de la calle')).toBeInTheDocument();
    expect(screen.getByText(/62 \/ 100 · Aceptable/)).toBeInTheDocument();
    expect(screen.getByText(/Severidad de reportes activos: -13/)).toBeInTheDocument();
    expect(screen.getByText('Fuente: comunidad')).toBeInTheDocument();
  });
});
