function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function endpointRateLimit(
  name:
    | 'REPORTS'
    | 'FEEDBACK'
    | 'FLAGS'
    | 'LOGIN'
    | 'REGISTER'
    | 'REPORT_STATUS'
    | 'ANALYTICS'
    | 'ROUTING',
) {
  const defaults = {
    REPORTS: 20,
    FEEDBACK: 30,
    FLAGS: 5,
    LOGIN: 5,
    REGISTER: 5,
    REPORT_STATUS: 10,
    ANALYTICS: 60,
    ROUTING: 20,
  };
  return {
    max: positiveInteger(process.env[`RATE_LIMIT_${name}_MAX`], defaults[name]),
    timeWindow: positiveInteger(process.env[`RATE_LIMIT_${name}_WINDOW_SECONDS`], 60) * 1000,
  };
}
