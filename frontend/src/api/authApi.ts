export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface UserProfile extends AuthUser {
  reportCount: number;
  confirmationsGiven: number;
  reputation: {
    confirmedReports: number;
    resolvedReports: number;
    usefulFeedback: number;
  };
}

import { API_BASE_URL } from './apiBaseUrl.js';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: { Accept: 'application/json', ...init.headers },
    });
  } catch {
    throw new Error('No se pudo conectar con Street Status.');
  }
  if (!response.ok) {
    if (response.status === 401) throw new Error('Email o contraseña incorrectos.');
    if (response.status === 409)
      throw new Error('No se pudo completar el registro. Revisá los datos e intentá de nuevo.');
    if (response.status === 429)
      throw new Error('Demasiados intentos. Esperá un momento y volvé a probar.');
    if (response.status === 400) throw new Error('Revisá los datos ingresados.');
    throw new Error('No pudimos completar la solicitud. Intentá de nuevo.');
  }
  return (await response.json()) as T;
}

export async function getSession(): Promise<AuthUser | null> {
  const result = await request<{ user: AuthUser | null }>('/auth/session');
  return result.user;
}

export async function getProfile(): Promise<UserProfile> {
  return request<UserProfile>('/users/me');
}

export async function register(input: {
  email: string;
  displayName: string;
  password: string;
}): Promise<AuthUser> {
  const result = await request<{ user: AuthUser }>('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return result.user;
}

export async function login(input: { email: string; password: string }): Promise<AuthUser> {
  const result = await request<{ user: AuthUser }>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return result.user;
}

export async function logout(): Promise<void> {
  await request<{ status: string }>('/auth/logout', { method: 'POST' });
}
