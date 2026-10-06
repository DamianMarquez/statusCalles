import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App.js';

describe('home page', () => {
  it('shows the application name and map', () => {
    render(<App />);

    expect(screen.getByText('Street Status')).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Mapa de calles de Buenos Aires' }),
    ).toBeInTheDocument();
  });
});
