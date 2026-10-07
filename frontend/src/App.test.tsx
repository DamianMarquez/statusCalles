import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App.js';

const mockMap = vi.hoisted(() => vi.fn());
const mockMyReports = vi.hoisted(() => vi.fn());
const mockOpenAuth = vi.hoisted(() => vi.fn());

vi.mock('./components/map/MapView.js', () => ({
  default: (props: { startReportOnOpen?: boolean }) => {
    mockMap(props);
    return <div role="region" aria-label="Mapa de calles de Buenos Aires" />;
  },
}));
vi.mock('./components/users/MyReports.js', () => ({
  MyReports: (props: {
    onViewMap: (report: { id: string; location: { latitude: number; longitude: number } }) => void;
    onCreateReport: () => void;
  }) => {
    mockMyReports(props);
    return (
      <>
        <button
          type="button"
          onClick={() =>
            props.onViewMap({ id: 'report-1', location: { latitude: -34.6, longitude: -58.4 } })
          }
        >
          Abrir reporte en el mapa
        </button>
        <button type="button" onClick={props.onCreateReport}>
          Crear reporte
        </button>
      </>
    );
  },
}));
vi.mock('./auth/AuthContext.js', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    AuthProvider: ({ children }: React.PropsWithChildren) =>
      React.createElement(React.Fragment, null, children),
    useAuth: () => ({ user: { id: 'user-1' }, openAuthDialog: mockOpenAuth }),
  };
});
vi.mock('./auth/AuthPanel.js', () => ({ AuthPanel: () => null }));

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
  vi.clearAllMocks();
});

describe('home page and navigation', () => {
  it('shows the application name and map', () => {
    render(<App />);
    expect(screen.getByText('Street Status')).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Mapa de calles de Buenos Aires' }),
    ).toBeInTheDocument();
  });

  it('navigates to My Reports and opens the selected report with onlyMine map filters', () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Mis reportes' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir reporte en el mapa' }));
    expect(
      screen.getByRole('region', { name: 'Mapa de calles de Buenos Aires' }),
    ).toBeInTheDocument();
    const params = new URLSearchParams(window.location.search);
    expect(params.get('onlyMine')).toBe('true');
    expect(params.get('focusId')).toBe('report-1');
    expect(params.get('focusLat')).toBe('-34.6');
  });

  it('starts map location selection from the My Reports create action', () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Mis reportes' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Crear reporte' }));
    expect(mockMap.mock.lastCall?.[0]).toMatchObject({ startReportOnOpen: true });
  });
});
