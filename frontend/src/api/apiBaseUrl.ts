/**
 * VITE_API_URL is the public backend origin (for example, https://api.example.com).
 * Vite embeds it in the static bundle at build time. With no value, same-origin
 * requests keep the local Vite proxy and same-domain reverse proxy behavior.
 */
export function resolveApiBaseUrl(configuredUrl?: string): string {
  const normalizedUrl = configuredUrl?.trim().replace(/\/+$/, '');
  if (!normalizedUrl) return '/api';
  return normalizedUrl.endsWith('/api') ? normalizedUrl : `${normalizedUrl}/api`;
}

export const API_BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL);
