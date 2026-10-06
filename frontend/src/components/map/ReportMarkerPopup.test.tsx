import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReportDto } from '../../api/reportTypes.js';
import { ReportMarkerPopup } from './ReportMarkerPopup.js';

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
};

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
});
