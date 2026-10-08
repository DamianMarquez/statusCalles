import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoadInformationPanel } from './RoadInformationPanel.js';
import type { SegmentRoadInformation } from '../../api/roadInformationTypes.js';

const { confirm, getInformation, propose } = vi.hoisted(() => ({
  confirm: vi.fn(),
  getInformation: vi.fn(),
  propose: vi.fn(),
}));

vi.mock('../../api/roadInformationApi.js', () => ({
  confirmSegmentRoadInformation: confirm,
  getSegmentRoadInformation: getInformation,
  proposeSegmentRoadInformation: propose,
}));

const emptyInformation: SegmentRoadInformation = {
  segmentId: 'segment-1',
  streetId: 'street-1',
  streetName: 'Avenida Ejemplo',
  profile: {
    roadType: null,
    surfaceType: null,
    surfaceCondition: null,
    specialTreatments: null,
    updatedAt: null,
  },
  proposals: [],
  history: [],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RoadInformationPanel', () => {
  it('shows missing attributes explicitly and submits a partial proposal', async () => {
    getInformation.mockResolvedValue(emptyInformation);
    propose.mockResolvedValue({
      ...emptyInformation,
      proposals: [
        {
          id: 'proposal-1',
          isAuthor: true,
          attributes: { surfaceType: 'CONCRETE_ASPHALT' },
          confirmations: 0,
          requiredConfirmations: 3,
          status: 'PROPOSED',
          createdAt: '2026-10-08T12:00:00.000Z',
          confirmedAt: null,
          userHasConfirmed: false,
        },
      ],
    });
    const onChanged = vi.fn();
    render(
      <RoadInformationPanel
        segmentId="segment-1"
        authenticated
        onRequestLogin={vi.fn()}
        onChanged={onChanged}
      />,
    );
    await screen.findAllByText('Sin información');
    fireEvent.click(screen.getByRole('button', { name: 'Informar un dato' }));
    fireEvent.change(screen.getByLabelText('Tipo de pavimento'), {
      target: { value: 'CONCRETE_ASPHALT' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar propuesta' }));
    await waitFor(() =>
      expect(propose).toHaveBeenCalledWith('segment-1', {
        surfaceType: 'CONCRETE_ASPHALT',
      }),
    );
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it('requires login before proposing a street attribute', async () => {
    getInformation.mockResolvedValue(emptyInformation);
    const onRequestLogin = vi.fn();
    render(
      <RoadInformationPanel
        segmentId="segment-1"
        authenticated={false}
        onRequestLogin={onRequestLogin}
        onChanged={vi.fn()}
      />,
    );
    await screen.findByRole('button', { name: 'Informar un dato' });
    fireEvent.click(screen.getByRole('button', { name: 'Informar un dato' }));
    expect(onRequestLogin).toHaveBeenCalledOnce();
    expect(propose).not.toHaveBeenCalled();
  });

  it('shows pending confirmations and confirms a proposal', async () => {
    getInformation.mockResolvedValue({
      ...emptyInformation,
      proposals: [
        {
          id: 'proposal-2',
          isAuthor: false,
          attributes: { surfaceType: 'ASPHALT' },
          confirmations: 2,
          requiredConfirmations: 3,
          status: 'PROPOSED',
          createdAt: '2026-10-08T12:00:00.000Z',
          confirmedAt: null,
          userHasConfirmed: false,
        },
      ],
    });
    confirm.mockResolvedValue(emptyInformation);
    render(
      <RoadInformationPanel
        segmentId="segment-1"
        authenticated
        onRequestLogin={vi.fn()}
        onChanged={vi.fn()}
      />,
    );
    await screen.findByText('2/3 confirmaciones');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar información' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith('proposal-2'));
  });
});
