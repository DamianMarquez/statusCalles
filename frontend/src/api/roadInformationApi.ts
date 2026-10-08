import { API_BASE_URL } from './apiBaseUrl.js';
import type { RoadInformationPatch, SegmentRoadInformation } from './roadInformationTypes.js';

export class RoadInformationApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'RoadInformationApiError';
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${url}`, {
      ...init,
      headers: { Accept: 'application/json', ...init?.headers },
      credentials: 'include',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new RoadInformationApiError('No pudimos conectar con la información de calles.');
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const result = body as { message?: string; code?: string } | null;
    throw new RoadInformationApiError(
      result?.message ?? 'No pudimos actualizar la información de este tramo.',
      result?.code,
    );
  }
  return body as T;
}

export function getSegmentRoadInformation(segmentId: string, signal?: AbortSignal) {
  return request<SegmentRoadInformation>(
    `/streets/segments/${encodeURIComponent(segmentId)}/information`,
    { signal },
  );
}

export function proposeSegmentRoadInformation(segmentId: string, patch: RoadInformationPatch) {
  return request<SegmentRoadInformation>(
    `/streets/segments/${encodeURIComponent(segmentId)}/information`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  );
}

export function confirmSegmentRoadInformation(proposalId: string) {
  return request<SegmentRoadInformation>(
    `/streets/information-proposals/${encodeURIComponent(proposalId)}/confirm`,
    { method: 'POST' },
  );
}
