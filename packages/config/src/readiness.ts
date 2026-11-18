import { defaultAnalyticsConfig, defaultMediaConfig } from './defaults.js';
import type { DomainPack, PodcastConfig } from './types.js';

/** One capability-readiness finding. `field` is the dotted pack path to set. */
export interface ReadinessIssue {
  level: 'error' | 'warn';
  field: string;
  message: string;
}

/** Podcast channel fields the RSS feed cannot be published without. */
export const REQUIRED_PODCAST_FIELDS = [
  'title',
  'description',
  'author',
  'ownerEmail',
  'category',
  'coverImage',
] as const;

/** The required podcast fields that are blank in `cfg`. */
export function missingPodcastFields(cfg: PodcastConfig): string[] {
  return REQUIRED_PODCAST_FIELDS.filter((k) => !String(cfg[k] ?? '').trim());
}

/**
 * Pack fields an enabled capability needs but the engine deliberately has no
 * default for (brand identity, voice clones, vertical vocabularies). Backs
 * `jeldon doctor`; engines call the narrower helpers above at run time.
 */
export function capabilityReadiness(pack: DomainPack): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  const media = pack.media ?? defaultMediaConfig;

  if (pack.capabilities.audio) {
    if (!media.narration.voiceId.trim()) {
      issues.push({
        level: 'error',
        field: 'media.narration.voiceId',
        message: 'capabilities.audio is on but media.narration.voiceId is unset — set your TTS provider voice id',
      });
    }
    for (const k of missingPodcastFields(media.podcast)) {
      issues.push({
        level: 'error',
        field: `media.podcast.${k}`,
        message: `capabilities.audio is on but media.podcast.${k} is unset — the podcast feed needs it`,
      });
    }
  }

  if (pack.capabilities.heroImages && !pack.media) {
    issues.push({
      level: 'warn',
      field: 'media.heroImage.promptTemplate',
      message:
        'capabilities.heroImages is on with no media block — using the neutral default hero style; set media.heroImage.promptTemplate for a house style',
    });
  }

  if (pack.capabilities.competitiveIntel) {
    if (!pack.competitors) {
      issues.push({
        level: 'error',
        field: 'competitors',
        message: 'capabilities.competitiveIntel is on but no competitors block is set — add a roster and targetKeywords',
      });
    } else if (!pack.competitors.highValuePatterns?.length) {
      issues.push({
        level: 'warn',
        field: 'competitors.highValuePatterns',
        message:
          'competitors.highValuePatterns is unset — the scanner only samples generic service/blog paths; add your vertical terms',
      });
    }
  }

  if (pack.capabilities.engagementAnalytics) {
    const host = siteHost(pack.brand?.siteUrl);
    const rules = (pack.analytics ?? defaultAnalyticsConfig).refererChannelMap;
    const dropsOwn = host && rules.some((r) => r.drop && r.needles.some((n) => host.includes(n.toLowerCase())));
    if (host && !dropsOwn) {
      issues.push({
        level: 'warn',
        field: 'analytics.refererChannelMap',
        message: `analytics.refererChannelMap has no drop rule for ${host} — internal navigation will count as a referral source`,
      });
    }
  }

  return issues;
}

function siteHost(url: string | undefined): string {
  try {
    return url ? new URL(url).hostname.toLowerCase().replace(/^www\./, '') : '';
  } catch {
    return '';
  }
}
