/**
 * One Brevo client. Collapses the THREE BoH Brevo helpers into a single class:
 *   - `src/lib/admin/brevo-campaigns.ts` (createScheduledCampaign / cancel /
 *     sendNow / nextSendSlot)
 *   - `src/lib/admin/brevo-config.ts` (stored-JSON ⊕ env config precedence)
 *   - `scripts/auto-newsletter.mjs` (the inline re-implementation of both)
 *
 * `resolveBrevoConfig()` is the single config resolver (stored config wins,
 * env-var fallback). `BrevoClient` carries the resolved config and exposes the
 * four campaign methods. `nextSendSlot` is a pure static (timezone is a param,
 * was the hardcoded `America/Los_Angeles` literal in all three files).
 */

const BREVO_URL = 'https://api.brevo.com/v3';

export interface BrevoConfig {
  apiKey: string;
  listId: number;
  templateId: number;
  senderName: string;
  senderEmail: string;
  /** ISO timestamp of the last admin-UI edit; null when from env only. */
  updatedAt?: string | null;
}

/** Stored (non-secret) portion — what lives in the repo JSON / admin UI. */
export interface BrevoStoredConfig {
  listId?: number;
  templateId?: number;
  senderName?: string;
  senderEmail?: string;
  updatedAt?: string | null;
}

export interface CampaignParams {
  ARTICLE_TITLE: string;
  ARTICLE_EXCERPT: string;
  ARTICLE_HERO_URL: string;
  ARTICLE_BODY: string;
  ARTICLE_URL: string;
  READ_TIME: string;
}

function toPositiveInt(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function nonEmpty(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export interface ResolveBrevoConfigOptions {
  /** Non-secret config read from the repo/admin store (null/absent → env-only). */
  stored?: BrevoStoredConfig | null;
  /** Process-env-like bag (pass `process.env` or `locals.runtime.env`). */
  env: Record<string, string | undefined>;
  /** Default sender name when neither stored nor env provides one. */
  defaultSenderName?: string;
}

/**
 * Resolve the runtime Brevo config: stored value wins, env-var fallback. Throws
 * if the API key (always from env) is missing, or if list/template/sender are
 * incomplete. Ported from `brevo-config.ts::readBrevoConfig` +
 * `auto-newsletter.mjs::loadBrevoConfig` (one implementation now).
 */
export function resolveBrevoConfig(opts: ResolveBrevoConfigOptions): BrevoConfig {
  const { stored, env } = opts;
  const apiKey = env.BREVO_API_KEY;
  if (!apiKey) throw new Error('BREVO_API_KEY is not set in the runtime environment.');

  const listId =
    toPositiveInt(stored?.listId) ?? toPositiveInt(env.BREVO_LIST_ID) ?? 0;
  const templateId =
    toPositiveInt(stored?.templateId) ??
    toPositiveInt(env.BREVO_NEWSLETTER_TEMPLATE_ID) ??
    0;
  const senderName =
    nonEmpty(stored?.senderName) ??
    nonEmpty(env.BREVO_SENDER_NAME) ??
    opts.defaultSenderName ??
    '';
  const senderEmail =
    nonEmpty(stored?.senderEmail) ?? nonEmpty(env.BREVO_SENDER_EMAIL) ?? '';

  if (!listId || !templateId || !senderEmail) {
    const missing: string[] = [];
    if (!listId) missing.push('listId');
    if (!templateId) missing.push('templateId');
    if (!senderEmail) missing.push('senderEmail');
    throw new Error(
      `Brevo config is incomplete (missing: ${missing.join(', ')}). Set values via ` +
        `the admin settings, or populate BREVO_LIST_ID / ` +
        `BREVO_NEWSLETTER_TEMPLATE_ID / BREVO_SENDER_EMAIL in the environment.`,
    );
  }

  return {
    apiKey,
    listId,
    templateId,
    senderName,
    senderEmail,
    updatedAt: stored?.updatedAt ?? null,
  };
}

/** Just the list id — for the public newsletter-signup path that doesn't need
 *  the rest. Returns null when nothing is configured. */
export function resolveBrevoListId(
  stored: BrevoStoredConfig | null | undefined,
  env: Record<string, string | undefined>,
): number | null {
  if (!env.BREVO_API_KEY) return null;
  return toPositiveInt(stored?.listId) ?? toPositiveInt(env.BREVO_LIST_ID) ?? null;
}

export class BrevoClient {
  constructor(private readonly config: BrevoConfig) {}

  /** Schedule a campaign against the configured list + template. */
  async createScheduledCampaign(args: {
    name: string;
    subject: string;
    params: CampaignParams;
    scheduledAt: Date;
  }): Promise<{ campaignId: number }> {
    const res = await fetch(`${BREVO_URL}/emailCampaigns`, {
      method: 'POST',
      headers: {
        'api-key': this.config.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        name: args.name,
        subject: args.subject,
        sender: { name: this.config.senderName, email: this.config.senderEmail },
        templateId: this.config.templateId,
        params: args.params,
        recipients: { listIds: [this.config.listId] },
        scheduledAt: args.scheduledAt.toISOString(),
      }),
    });
    if (!res.ok) throw new Error(`Brevo create ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { id: number };
    return { campaignId: data.id };
  }

  /**
   * Cancel a scheduled campaign. Brevo has no hard delete for a scheduled-
   * but-unsent campaign — "suspended" is the kill state.
   */
  async cancel(campaignId: number): Promise<void> {
    const res = await fetch(`${BREVO_URL}/emailCampaigns/${campaignId}/status`, {
      method: 'PUT',
      headers: {
        'api-key': this.config.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ status: 'suspended' }),
    });
    if (!res.ok) throw new Error(`Brevo cancel ${res.status}: ${await res.text()}`);
  }

  /** Fire a campaign immediately. */
  async sendNow(campaignId: number): Promise<void> {
    const res = await fetch(`${BREVO_URL}/emailCampaigns/${campaignId}/sendNow`, {
      method: 'POST',
      headers: { 'api-key': this.config.apiKey, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Brevo sendNow ${res.status}: ${await res.text()}`);
  }

  /**
   * Send timing: prefer the next `hour`:00 in `timezone`, with a `floorHours`
   * floor from `now` so a same-hour publish doesn't blast immediately. Pure +
   * static so it's unit-testable without a client. Ported verbatim from
   * `brevo-campaigns.ts::nextSendSlot` (timezone + hour were `America/
   * Los_Angeles` / 10 literals).
   */
  static nextSendSlot(
    now: Date,
    timezone = 'America/Los_Angeles',
    hour = 10,
    floorHours = 4,
  ): Date {
    const earliest = new Date(now.getTime() + floorHours * 60 * 60 * 1000);

    const todayLocal = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);

    const hh = String(hour).padStart(2, '0');
    // Walk to the UTC instant that prints as `hour`:00 in the target tz. Start
    // from a PST guess and correct by the DST gap (the BoH derivation — no
    // hardcoded DST rules).
    let target = new Date(`${todayLocal}T${hh}:00:00-08:00`);
    for (let i = 0; i < 2; i++) {
      const hourInTz = Number(
        new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          hour: '2-digit',
          hour12: false,
        }).format(target),
      );
      if (hourInTz === hour) break;
      target = new Date(target.getTime() + (hour - hourInTz) * 60 * 60 * 1000);
    }

    if (target.getTime() < earliest.getTime()) {
      target = new Date(target.getTime() + 24 * 60 * 60 * 1000);
      if (target.getTime() < earliest.getTime()) target = earliest;
    }
    return target;
  }
}
