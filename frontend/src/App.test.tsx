import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App.js';

describe('home page', () => {
  it('shows the application name and map placeholder', () => {
    render(<App />);

    expect(screen.getByText('Street Status')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Tu ciudad, calle por calle.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Mapa en preparación')).toBeInTheDocument();
  });
});
