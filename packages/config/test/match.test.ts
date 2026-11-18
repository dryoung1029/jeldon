import { describe, expect, it } from 'vitest';
import { hostIs, hostOf, mentionsTerm, termRegex, validateDomainPack } from '../src/index.js';

describe('anchored matching', () => {
  it('hostOf handles URLs, bare hosts and junk', () => {
    expect(hostOf('https://www.Reddit.com/r/x')).toBe('reddit.com');
    expect(hostOf('old.reddit.com')).toBe('old.reddit.com');
    expect(hostOf('//t.co/abc')).toBe('t.co');
    expect(hostOf('')).toBe('');
  });

  it('hostIs is exact-or-subdomain, never substring', () => {
    expect(hostIs('t.co', 't.co')).toBe(true);
    expect(hostIs('reddit.com', 't.co')).toBe(false);
    expect(hostIs('chatgpt.com', 't.co')).toBe(false);
    expect(hostIs('old.reddit.com', 'reddit.com')).toBe(true);
    expect(hostIs('notreddit.com', 'reddit.com')).toBe(false);
  });

  it('termRegex respects word boundaries and optional periods', () => {
    expect(termRegex('dr young').test('Dr. Young said')).toBe(true);
    expect(termRegex('dr. young').test('Dr Young said')).toBe(true);
    expect(termRegex('dr young').test('Dr. Younger said')).toBe(false);
    expect(termRegex('acme').test('Acmeville')).toBe(false);
  });

  it('mentionsTerm strips generic phrasings before testing', () => {
    const ex = ['\\bgrowing\\s+body of health\\b'];
    expect(mentionsTerm('a growing body of health research', 'body of health', ex)).toBe(false);
    expect(mentionsTerm('the Body of Health clinic', 'body of health', ex)).toBe(true);
  });
});

describe('refererChannelMap migration', () => {
  it('rejects the removed substring `needles` with a migration message', () => {
    const r = validateDomainPack({
      analytics: { refererChannelMap: [{ label: 'X', needles: ['t.co'] }] },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path.endsWith('needles') && e.message.includes('hosts'))).toBe(true);
  });
});
