import { describe, expect, it } from 'vitest';
import { parseTrustProxy } from './build-app.js';

describe('parseTrustProxy', () => {
  it('does not trust proxies when empty or false', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('')).toBe(false);
    expect(parseTrustProxy(' FALSE ')).toBe(false);
  });

  it('trusts the proxy by default on Vercel unless explicitly disabled', () => {
    expect(parseTrustProxy('', true)).toBe(true);
    expect(parseTrustProxy(undefined, true)).toBe(true);
    expect(parseTrustProxy('false', true)).toBe(false);
  });

  it('trusts the forwarding proxy when true', () => {
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('True')).toBe(true);
  });

  it('keeps a list of addresses or ranges', () => {
    expect(parseTrustProxy('10.0.0.1, 192.168.0.0/16')).toEqual(['10.0.0.1', '192.168.0.0/16']);
  });
});
