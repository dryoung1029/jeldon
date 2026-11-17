import { describe, expect, it } from 'vitest';
import { diagnoseSearchConsoleError as diagnose, nearMissEnvNames } from '../src/index.js';

const g403 = (message: string, reason: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ error: { code: 403, message, status: 'PERMISSION_DENIED', errors: [{ reason, message }], ...extra } });

const permission = (site: string) => g403(`User does not have sufficient permission for site '${site}'. See also: https://support.google.com/webmasters/answer/2451999.`, 'forbidden');

describe('diagnoseSearchConsoleError', () => {
  it('(1) secret read as empty → names the secret and the near-miss', () => {
    const d = diagnose(0, '', { stage: 'config', emptySecret: 'GOOGLE_SEARCH_CONSOLE_SA_KEY', nearMissEnv: ['GOOGLE_SEACH_CONSOLE_SA_KEY'] });
    expect(d.kind).toBe('secret_empty');
    expect(d.fix).toContain('GOOGLE_SEACH_CONSOLE_SA_KEY');
    expect(d.fix).toMatch(/\*\*\*/);
  });

  it('(2) accessNotConfigured / SERVICE_DISABLED → enable-API link from the body', () => {
    const body = g403(
      'Google Search Console API has not been used in project 123456789 before or it is disabled.',
      'accessNotConfigured',
      {
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
            reason: 'SERVICE_DISABLED',
            metadata: { activationUrl: 'https://console.developers.google.com/apis/api/searchconsole.googleapis.com/overview?project=123456789' },
          },
        ],
      },
    );
    const d = diagnose(403, body, { stage: 'query', property: 'sc-domain:example.com' });
    expect(d.kind).toBe('api_not_enabled');
    expect(d.link).toBe('https://console.developers.google.com/apis/api/searchconsole.googleapis.com/overview?project=123456789');
  });

  it('(2) builds the link from the project number when no activationUrl is present', () => {
    const d = diagnose(403, g403('Search Console API has not been used in project 42424242 before', 'accessNotConfigured'), { stage: 'query' });
    expect(d.kind).toBe('api_not_enabled');
    expect(d.link).toMatch(/project=42424242$/);
  });

  it('(3) generic 403 on a well-formed https property → sa_not_user, flags the look-alike', () => {
    const d = diagnose(403, permission('https://example.com/'), { stage: 'query', property: 'https://example.com/', clientEmail: 'sa@p.iam' });
    expect(d.kind).toBe('sa_not_user');
    expect(d.fix).toContain('sa@p.iam');
    expect(d.alsoPossible?.kind).toBe('property_mismatch');
  });

  it('(3) with the site list empty → sa_not_user, decisively', () => {
    const d = diagnose(403, permission('sc-domain:example.com'), { stage: 'query', property: 'sc-domain:example.com', accessibleSites: [] });
    expect(d.kind).toBe('sa_not_user');
    expect(d.alsoPossible).toBeUndefined();
  });

  it('(4) body echoes http:// → property_mismatch (the BoH tell)', () => {
    expect(diagnose(403, permission('http://example.com/'), { stage: 'query', property: 'http://example.com/' }).kind).toBe('property_mismatch');
  });

  it('(4) masked body from a CI log still shows the scheme', () => {
    expect(diagnose(403, permission('http://***'), { stage: 'query' }).kind).toBe('property_mismatch');
  });

  it('(4) malformed property (no trailing slash) → property_mismatch with suggestion', () => {
    const d = diagnose(403, permission('https://example.com'), { stage: 'query', property: 'https://example.com' });
    expect(d.kind).toBe('property_mismatch');
    expect(d.suggestedProperty).toBe('https://example.com/');
  });

  it('(4) site list holds another form of the same site → property_mismatch naming it', () => {
    const d = diagnose(403, permission('https://www.example.com/'), {
      stage: 'query',
      property: 'https://www.example.com/',
      accessibleSites: ['sc-domain:example.com', 'https://other.test/'],
    });
    expect(d.kind).toBe('property_mismatch');
    expect(d.suggestedProperty).toBe('sc-domain:example.com');
  });

  it('does not treat a suffix-only host as the same site', () => {
    const d = diagnose(403, permission('https://example.com/'), {
      stage: 'query',
      property: 'https://example.com/',
      accessibleSites: ['sc-domain:notexample.com'],
    });
    expect(d.kind).toBe('sa_not_user');
  });

  it('403 on a property the SA can list → unattestable, not a guess', () => {
    const d = diagnose(403, permission('https://example.com/'), { stage: 'query', property: 'https://example.com/', accessibleSites: ['https://example.com/'] });
    expect(d.kind).toBe('unattestable');
  });

  it('token-stage invalid_grant → key_rejected', () => {
    expect(diagnose(400, '{"error":"invalid_grant","error_description":"Invalid JWT Signature."}', { stage: 'token' }).kind).toBe('key_rejected');
  });

  it('anything else → unattestable with the raw message', () => {
    const d = diagnose(500, 'backend exploded', { stage: 'query' });
    expect(d.kind).toBe('unattestable');
    expect(d.raw).toBe('500 backend exploded');
    expect(diagnose(429, g403('Quota exceeded', 'rateLimitExceeded')).kind).toBe('unattestable');
  });
});

describe('nearMissEnvNames', () => {
  it('finds the BoH misspelling, ignores empties and unrelated names', () => {
    const env = { GOOGLE_SEACH_CONSOLE_SA_KEY: 'x', GOOGLE_SEARCH_CONSOLE_SA_KEY: '', GSC_PROP: 'y', PATH: '/bin', GOOGLE_SEARCH_CONSOLE_SA_KEX: '' };
    expect(nearMissEnvNames('GOOGLE_SEARCH_CONSOLE_SA_KEY', env)).toEqual(['GOOGLE_SEACH_CONSOLE_SA_KEY']);
  });
});
