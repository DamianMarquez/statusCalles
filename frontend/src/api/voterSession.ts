const voterIdKey = 'street-status-voter-id';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let fallbackVoterId: string | null = null;

export function getVoterSessionId(): string {
  try {
    const storedId = localStorage.getItem(voterIdKey);
    if (storedId && uuidPattern.test(storedId)) return storedId;
    const voterId = crypto.randomUUID();
    localStorage.setItem(voterIdKey, voterId);
    return voterId;
  } catch {
    fallbackVoterId ??= crypto.randomUUID();
    return fallbackVoterId;
  }
}
