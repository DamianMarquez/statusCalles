import type { MobilityInfrastructureItem, MobilitySourceStatus } from '../domain/mobility-data.js';

export interface MobilityCatalogRepository {
  findForStreet(streetId: string): Promise<MobilityInfrastructureItem[]>;
  listSourceStatuses(): Promise<MobilitySourceStatus[]>;
}

export class MobilityCatalogService {
  constructor(private readonly repository: MobilityCatalogRepository) {}

  findForStreet(streetId: string) {
    return this.repository.findForStreet(streetId);
  }

  listSourceStatuses() {
    return this.repository.listSourceStatuses().then((sources) => [
      ...sources,
      {
        source: 'API Transporte GCBA (tránsito, cortes y transporte realtime)',
        url: 'https://data.buenosaires.gob.ar/dataset/api-transporte-publico',
        status: 'SUSPENDED' as const,
        lastAttempt: null,
        lastSuccessfulSync: null,
        recordsImported: null,
        errorMessage:
          'El portal oficial informa que los recursos API/GTFS están suspendidos y en revisión.',
      },
    ]);
  }
}
