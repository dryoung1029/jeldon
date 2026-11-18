import { describe, expect, it } from 'vitest';
import { capabilityReadiness, defaultAnalyticsConfig, defaultMediaConfig, type DomainPack } from '@jeldon/config';
import { bodyOfHealthMedia } from '../../../fixtures/domain-packs/body-of-health.media.ts';

/** Only the fields capabilityReadiness reads. */
function pack(over: Partial<DomainPack>): DomainPack {
  return { capabilities: {}, ...over } as DomainPack;
}

describe('capabilityReadiness (backs jeldon doctor)', () => {
  it('reports nothing when the media/competitive capabilities are off', () => {
    expect(capabilityReadiness(pack({}))).toEqual([]);
  });

  it('errors on the blank voice id + podcast identity when audio is on', () => {
    const issues = capabilityReadiness(pack({ capabilities: { audio: true } }));
    const errored = issues.filter((i) => i.level === 'error').map((i) => i.field);
    expect(errored).toEqual([
      'media.narration.voiceId',
      'media.podcast.title',
      'media.podcast.description',
      'media.podcast.author',
      'media.podcast.ownerEmail',
      'media.podcast.category',
      'media.podcast.coverImage',
    ]);
  });

  it('is clean for audio once the pack fills the media block', () => {
    expect(capabilityReadiness(pack({ capabilities: { audio: true }, media: bodyOfHealthMedia }))).toEqual([]);
  });

  it('warns (not errors) when hero images use the neutral default style', () => {
    const issues = capabilityReadiness(pack({ capabilities: { heroImages: true } }));
    expect(issues.map((i) => i.level)).toEqual(['warn']);
    expect(capabilityReadiness(pack({ capabilities: { heroImages: true }, media: defaultMediaConfig }))).toEqual([]);
  });

  it('requires a competitors block and warns on missing vertical patterns', () => {
    expect(capabilityReadiness(pack({ capabilities: { competitiveIntel: true } }))[0]?.level).toBe('error');
    const issues = capabilityReadiness(
      pack({ capabilities: { competitiveIntel: true }, competitors: { roster: [], targetKeywords: [] } }),
    );
    expect(issues.map((i) => [i.level, i.field])).toEqual([['warn', 'competitors.highValuePatterns']]);
  });

  it('warns when analytics does not drop the site\'s own host', () => {
    const brand = { name: 'N', siteUrl: 'https://www.northwatch.dev' };
    const issues = capabilityReadiness(pack({ capabilities: { engagementAnalytics: true }, brand }));
    expect(issues.map((i) => i.field)).toEqual(['analytics.refererChannelMap']);
    const analytics = {
      ...defaultAnalyticsConfig,
      refererChannelMap: [{ needles: ['northwatch.dev'], drop: true }, ...defaultAnalyticsConfig.refererChannelMap],
    };
    expect(capabilityReadiness(pack({ capabilities: { engagementAnalytics: true }, brand, analytics }))).toEqual([]);
  });
});
