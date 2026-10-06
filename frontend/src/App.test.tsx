import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App.js';

vi.mock('./components/map/MapView.js', () => ({
  default: () => <div role="region" aria-label="Mapa de calles de Buenos Aires" />,
}));

describe('home page', () => {
  it('shows the application name and map', () => {
    render(<App />);

    expect(screen.getByText('Street Status')).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Mapa de calles de Buenos Aires' }),
    ).toBeInTheDocument();
  });
});
