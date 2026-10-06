import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from './AuthContext.js';
import { AuthPanel } from './AuthPanel.js';

function value(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: null,
    profile: null,
    loading: false,
    dialogOpen: false,
    openAuthDialog: vi.fn(),
    closeAuthDialog: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshProfile: vi.fn(),
    ...overrides,
  };
}

describe('AuthPanel', () => {
  it('opens login and registration forms', () => {
    const context = value({ dialogOpen: true });
    render(
      <AuthContext.Provider value={context}>
        <AuthPanel />
      </AuthContext.Provider>,
    );

    expect(screen.getByRole('heading', { name: 'Ingresá a tu cuenta' })).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('minLength', '12');
    fireEvent.click(screen.getByRole('button', { name: '¿No tenés cuenta? Registrate' }));
    expect(screen.getByRole('heading', { name: 'Creá tu cuenta' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre visible')).toBeRequired();
  });

  it('shows profile, activity counts, and account date', () => {
    const context = value({
      dialogOpen: true,
      user: {
        id: 'user-1',
        email: 'street@example.com',
        displayName: 'Damián',
        createdAt: '2026-01-02T00:00:00.000Z',
      },
      profile: {
        id: 'user-1',
        email: 'street@example.com',
        displayName: 'Damián',
        createdAt: '2026-01-02T00:00:00.000Z',
        reportCount: 4,
        confirmationsGiven: 7,
        reputation: { confirmedReports: 2, resolvedReports: 1, usefulFeedback: 3 },
      },
    });
    render(
      <AuthContext.Provider value={context}>
        <AuthPanel />
      </AuthContext.Provider>,
    );

    expect(screen.getByRole('heading', { name: 'Hola, Damián' })).toBeInTheDocument();
    expect(screen.getByText('Reportes')).toBeInTheDocument();
    expect(screen.getByText('Confirmaciones dadas')).toBeInTheDocument();
    expect(screen.getByText('Feedback útil')).toBeInTheDocument();
  });
});
