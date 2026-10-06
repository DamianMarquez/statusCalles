export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
}

export interface UserProfile extends PublicUser {
  reportCount: number;
  confirmationsGiven: number;
  reputation: {
    confirmedReports: number;
    resolvedReports: number;
    usefulFeedback: number;
  };
}

export interface CreateUser {
  email: string;
  displayName: string;
  passwordHash: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
