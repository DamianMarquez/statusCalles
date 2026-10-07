import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchAddresses } from '../../api/addressesApi.js';
import type { AddressSearchResult } from '../../api/addressesApi.js';
import { AddressSearchInput } from './AddressSearchInput.js';

vi.mock('../../api/addressesApi.js', () => ({ searchAddresses: vi.fn() }));

const address = (id: string, displayName: string): AddressSearchResult => ({
  id,
  type: displayName.includes(' y ') ? 'INTERSECTION' : 'STREET_NUMBER',
  displayName,
  street: 'AV. CORRIENTES',
  streetCode: '3174',
  streetNumber: null,
  intersectionStreet: displayName.includes(' y ') ? 'AV. CALLAO' : null,
  intersectionStreetCode: displayName.includes(' y ') ? '3030' : null,
  latitude: -34.6,
  longitude: -58.39,
  neighborhood: 'Balvanera',
  commune: 'CABA',
  confidence: null,
  source: 'USIG',
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('AddressSearchInput', () => {
  it('shows ambiguous results and returns only the explicitly selected candidate', async () => {
    const options = [
      address('1', 'Sarmiento 500, CABA'),
      address('2', 'Fragata Pres. Sarmiento 500, CABA'),
    ];
    vi.mocked(searchAddresses).mockResolvedValue(options);
    const onSelect = vi.fn();
    render(<AddressSearchInput label="Destino" value={null} onSelect={onSelect} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Destino' }), {
      target: { value: 'Sarmiento 500' },
    });
    expect((await screen.findAllByRole('option', { name: /Sarmiento 500, CABA/ })).length).toBe(2);
    fireEvent.click(screen.getByRole('option', { name: /Fragata Pres. Sarmiento/ }));
    expect(onSelect).toHaveBeenCalledWith(options[1]);
  });

  it('debounces and prevents an older response from replacing the latest results', async () => {
    let resolveFirst!: (items: AddressSearchResult[]) => void;
    let resolveSecond!: (items: AddressSearchResult[]) => void;
    vi.mocked(searchAddresses)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );
    render(<AddressSearchInput label="Destino" value={null} onSelect={vi.fn()} />);
    const input = screen.getByRole('combobox', { name: 'Destino' });
    fireEvent.change(input, { target: { value: 'Corrientes 1' } });
    await waitFor(() => expect(searchAddresses).toHaveBeenCalledTimes(1));
    expect(searchAddresses).toHaveBeenCalledTimes(1);
    fireEvent.change(input, { target: { value: 'Corrientes y Callao' } });
    await waitFor(() => expect(searchAddresses).toHaveBeenCalledTimes(2));
    expect(searchAddresses).toHaveBeenCalledTimes(2);
    await act(async () => {
      resolveSecond([address('latest', 'Corrientes y Callao, CABA')]);
    });
    expect(await screen.findByRole('option', { name: /Corrientes y Callao/ })).toBeInTheDocument();
    await act(async () => {
      resolveFirst([address('old', 'Corrientes 1, CABA')]);
    });
    expect(screen.getByRole('option', { name: /Corrientes y Callao/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Corrientes 1, CABA/ })).not.toBeInTheDocument();
  });

  it('clears the text and selected result', async () => {
    const selected = address('1', 'Corrientes 1234, CABA');
    const onClear = vi.fn();
    render(
      <AddressSearchInput label="Origen" value={selected} onSelect={vi.fn()} onClear={onClear} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar origen' }));
    expect(screen.getByRole('combobox', { name: 'Origen' })).toHaveValue('');
    expect(onClear).toHaveBeenCalledOnce();
  });
});
