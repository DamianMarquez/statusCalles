import type { MapReport } from './types.js';

export const mockReports: MapReport[] = [
  {
    id: 'report-pothole-1',
    category: 'pothole',
    title: 'Bache',
    description: 'Bache sobre la calzada, atención al circular.',
    position: [-34.6078, -58.3927],
  },
  {
    id: 'report-flooding-1',
    category: 'flooding',
    title: 'Inundación',
    description: 'Agua acumulada en la esquina.',
    position: [-34.5971, -58.3748],
  },
  {
    id: 'report-construction-1',
    category: 'construction',
    title: 'Obra',
    description: 'Trabajos en curso sobre la calle.',
    position: [-34.6152, -58.3842],
  },
];
