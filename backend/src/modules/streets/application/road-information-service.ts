import type {
  RoadInformationPatch,
  RoadInformationHistoryEntry,
  RoadInformationProfile,
  RoadInformationProposal,
} from '../domain/road-information.js';

export interface SegmentRoadInformation {
  segmentId: string;
  streetId: string;
  streetName: string;
  profile: RoadInformationProfile;
  proposals: RoadInformationProposal[];
  history: RoadInformationHistoryEntry[];
}

export interface RoadInformationRepository {
  findForSegment(segmentId: string, userId: string | null): Promise<SegmentRoadInformation | null>;
  createProposal(
    segmentId: string,
    authorId: string,
    attributes: RoadInformationPatch,
  ): Promise<SegmentRoadInformation | null>;
  confirmProposal(
    proposalId: string,
    userId: string,
  ): Promise<{
    information: SegmentRoadInformation | null;
    reason?: 'NOT_FOUND' | 'AUTHOR' | 'DUPLICATE';
  }>;
}

export class RoadInformationService {
  constructor(private readonly repository: RoadInformationRepository) {}

  findForSegment(segmentId: string, userId: string | null) {
    return this.repository.findForSegment(segmentId, userId);
  }

  createProposal(segmentId: string, authorId: string, attributes: RoadInformationPatch) {
    return this.repository.createProposal(segmentId, authorId, attributes);
  }

  confirmProposal(proposalId: string, userId: string) {
    return this.repository.confirmProposal(proposalId, userId);
  }
}
