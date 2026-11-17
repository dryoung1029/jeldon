import {
  defaultMailboxOutcomeRules,
  type DomainPack,
  type MailboxComplianceConfig,
  type MailboxOutcomeRules,
  type MailboxRule,
} from '@jeldon/config';

/**
 * @jeldon/leads/compliance — mailbox response tracking.
 *
 * ============================================================================
 * COMPLIANCE-PACK MATERIAL. Nothing here runs unless the Domain Pack sets
 * `compliance.pack` to something other than `none` AND
 * `compliance.mailbox.enabled: true`. `createMailboxTracker` throws otherwise.
 * ============================================================================
 *
 * It answers: did we get back to each lead, how fast, how much back-and-forth,
 * and why did a thread go quiet. To classify outcomes it reads message text.
 * The invariant: TEXT STAYS INSIDE THE FUNCTION. It is reduced to rule codes
 * (`why.out-of-network`, never the sentence that matched) and dropped. No
 * function here returns message text, and callers must not persist what they
 * fetched — the mailbox is the system of record and this is a window onto it.
 *
 * What it can and cannot see:
 *   - It sees EMAIL. A lead phoned back looks identical to a lead nobody
 *     touched, so "no reply" is a question, not a verdict; `reachedVia` folds
 *     in the other evidence (booked > email > phone tap > worked by hand).
 *   - The system's own NOTIFICATION email is sent BY the mailbox, so naive
 *     "from us = we answered" logic scores every lead as answered in seconds.
 *     It is excluded by identity: the message from us nearest the lead's own
 *     timestamp, within `notificationWindowMinutes`.
 *   - Outcome rules are keyword rules, not a model. They miss and they
 *     mis-fire; every classification is a starting point to check.
 *   - Decline REASONS are consulted only once a decline is detected: on its
 *     own, a question about price is a question, not a refusal.
 */

export type MailboxGate =
  | { allowed: true; compliancePack: string; config: MailboxComplianceConfig }
  | { allowed: false; reason: 'no_compliance_pack' | 'mailbox_not_enabled'; message: string };

export function mailboxGate(pack: { compliance?: DomainPack['compliance'] }): MailboxGate {
  const c = pack.compliance;
  const name = (c?.pack ?? 'none').trim();
  if (!name || name === 'none') {
    return {
      allowed: false,
      reason: 'no_compliance_pack',
      message:
        'Mailbox response tracking reads message text and is compliance-pack material. Set compliance.pack (not "none") and compliance.mailbox.enabled to use it.',
    };
  }
  if (!c?.mailbox?.enabled) {
    return {
      allowed: false,
      reason: 'mailbox_not_enabled',
      message: `compliance.pack is "${name}" but compliance.mailbox.enabled is not true.`,
    };
  }
  return { allowed: true, compliancePack: name, config: c.mailbox };
}

export class MailboxComplianceError extends Error {
  readonly reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.name = 'MailboxComplianceError';
    this.reason = reason;
  }
}

export interface ThreadMessage {
  /** Envelope From, address only. */
  fromEmail: string;
  /** ms since epoch. */
  at: number;
  /** Message text, only when outcome classification is wanted. Read inside
   *  the tracker, reduced to codes, never returned. */
  text?: string;
}

export interface LeadResponse {
  /** Someone from our side emailed them back (notification excluded). */
  replied: boolean;
  firstReplyAt: string | null;
  responseMinutes: number | null;
  ourMessages: number;
  theirMessages: number;
  exchanged: number;
  lastAt: string | null;
  lastDirection: 'us' | 'them' | null;
  /** They wrote last (raw; see `stillAwaitingUs` for the outcome-aware one). */
  awaitingUs: boolean;
  autoReplyLikely: boolean;
  /** Any message matched this lead at all. False = nothing to judge. */
  found: boolean;
}

export type PhoneFollowup = 'us' | 'them' | null;

export interface ThreadOutcome {
  phoneFollowup: PhoneFollowup;
  declined: boolean;
  /** A reason code from the rules, `unspecified`, or null when not declined. */
  declineReason: string | null;
  bookedInThread: boolean;
  /** Rule IDs that fired. Never text. */
  matched: string[];
}

export interface LeadAnalysis {
  response: LeadResponse;
  outcome: ThreadOutcome;
  /** Outcome-aware: a decline closes it, "we'll call" takes it off our list,
   *  "please call me" keeps it on. */
  awaitingUs: boolean;
}

export type ReachedVia = 'booked' | 'email' | 'phone' | 'worked' | null;

export interface LeadReachInput {
  response: LeadResponse;
  status: string;
  booked: boolean;
  /** Absent on leads captured before phone taps were recorded. */
  phoneClicks?: number;
}

export interface ReachSummary {
  leads: number;
  booked: number;
  email: number;
  phone: number;
  worked: number;
  /** Nothing reached them. The only number here that is a problem. */
  unreached: number;
  /** Leads that could carry a phone signal at all (the field is forward-only). */
  phoneTrackable: number;
}

export const SPEED_BUCKETS = ['under-1h', '1-4h', '4-24h', '1-3d', 'over-3d', 'no-reply'] as const;
export type SpeedBucket = (typeof SPEED_BUCKETS)[number];

export function speedBucket(minutes: number | null): SpeedBucket {
  if (minutes == null) return 'no-reply';
  if (minutes < 60) return 'under-1h';
  if (minutes < 60 * 4) return '1-4h';
  if (minutes < 60 * 24) return '4-24h';
  if (minutes < 60 * 24 * 3) return '1-3d';
  return 'over-3d';
}

export interface ResponseAggregate {
  leads: number;
  repliedByEmail: number;
  /** No email reply AND status still `new`: nobody touched it anywhere. */
  noReplyNoContact: number;
  /** No email reply, but the status moved — probably phoned. */
  noReplyButWorked: number;
  medianResponseMinutes: number | null;
  withinHour: number;
  withinDay: number;
  overDay: number;
  medianExchanged: number | null;
  awaitingUs: number;
  autoReplyLikely: number;
  /** Booked split by reply speed; `lowSample` under `minLeads`. */
  bookedBySpeed: Array<{ bucket: SpeedBucket; leads: number; booked: number; rate: number | null; lowSample: boolean }>;
}

export interface OutcomeSummary {
  threads: number;
  phoneFollowupUs: number;
  phoneFollowupThem: number;
  declined: number;
  bookedInThread: number;
  byReason: Array<{ reason: string; label: string; count: number }>;
}

export interface MailboxTracker {
  readonly compliancePack: string;
  readonly mailbox: string;
  summarizeThread(messages: ThreadMessage[], receivedAt: string): LeadResponse;
  classifyThread(messages: ThreadMessage[], receivedAt: string): ThreadOutcome;
  /** Both, with text dropped. The usual entry point. */
  analyzeLead(messages: ThreadMessage[], receivedAt: string): LeadAnalysis;
  stillAwaitingUs(lastDirection: 'us' | 'them' | null, o: ThreadOutcome): boolean;
  aggregate(rows: Array<{ response: LeadResponse; status: string; booked: boolean }>, minLeads?: number): ResponseAggregate;
  reachedVia(lead: LeadReachInput): ReachedVia;
  summarizeReach(leads: LeadReachInput[]): ReachSummary;
  summarizeOutcomes(outcomes: ThreadOutcome[]): OutcomeSummary;
}

type Compiled = { id: string; re: RegExp };
const compile = (rules: MailboxRule[]): Compiled[] => rules.map((r) => ({ id: r.id, re: new RegExp(`\\b(?:${r.pattern})`, 'i') }));
const firstMatch = (rules: Compiled[], text: string): string | null => {
  for (const r of rules) if (r.re.test(text)) return r.id;
  return null;
};

function median(ns: number[]): number | null {
  if (!ns.length) return null;
  const s = [...ns].sort((a, b) => a - b);
  const mid = s.length / 2;
  return s.length % 2 ? s[(s.length - 1) / 2]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

/**
 * The tracker, or a thrown `MailboxComplianceError` when the pack does not
 * allow mailbox reading or names no mailbox address.
 */
export function createMailboxTracker(
  pack: { compliance?: DomainPack['compliance'] },
  opts: { mailbox?: string } = {},
): MailboxTracker {
  const gate = mailboxGate(pack);
  if (!gate.allowed) throw new MailboxComplianceError(gate.reason, gate.message);
  const cfg = gate.config;
  const mailbox = (opts.mailbox ?? cfg.address ?? '').trim().toLowerCase();
  if (!mailbox) {
    throw new MailboxComplianceError('no_mailbox_address', 'compliance.mailbox.address (or opts.mailbox) must name the mailbox the system sends from.');
  }
  const rules: MailboxOutcomeRules = cfg.rules ?? defaultMailboxOutcomeRules;
  const R = {
    phoneUs: compile(rules.phoneFromUs),
    phoneThem: compile(rules.phoneFromThem),
    decline: compile(rules.decline),
    booked: compile(rules.bookedInThread),
    reasons: rules.declineReasons.map((x) => ({ reason: x.reason, rules: compile(x.rules) })),
  };
  const labels = new Map<string, string>([...rules.declineReasons.map((x) => [x.reason, x.label] as const), ['unspecified', rules.unspecifiedLabel]]);
  const windowMs = cfg.notificationWindowMinutes * 60_000;
  const autoUnder = cfg.autoReplyUnderMinutes;
  const isOurs = (m: ThreadMessage) => m.fromEmail.trim().toLowerCase() === mailbox;

  /** Sorted messages after this lead's notification (or after the lead, when
   *  no notification is found). The notification itself is never included. */
  function conversation(messages: ThreadMessage[], leadAt: number): { after: ThreadMessage[]; notifFound: boolean } {
    const sorted = messages.filter((m) => Number.isFinite(m.at)).sort((a, b) => a.at - b.at);
    let notifIdx = -1;
    let best = Infinity;
    sorted.forEach((m, i) => {
      if (!isOurs(m)) return;
      const gap = Math.abs(m.at - leadAt);
      if (gap <= windowMs && gap < best) {
        best = gap;
        notifIdx = i;
      }
    });
    return {
      after: notifIdx >= 0 ? sorted.slice(notifIdx + 1) : sorted.filter((m) => m.at >= leadAt),
      notifFound: notifIdx >= 0,
    };
  }

  function summarizeThread(messages: ThreadMessage[], receivedAt: string): LeadResponse {
    const empty: LeadResponse = {
      replied: false, firstReplyAt: null, responseMinutes: null, ourMessages: 0, theirMessages: 0,
      exchanged: 0, lastAt: null, lastDirection: null, awaitingUs: false, autoReplyLikely: false, found: false,
    };
    const leadAt = Date.parse(receivedAt);
    if (!Number.isFinite(leadAt)) return empty;
    const { after, notifFound } = conversation(messages, leadAt);
    if (!notifFound && !after.length) return empty;
    let ours = 0, theirs = 0;
    let first: ThreadMessage | null = null;
    for (const m of after) {
      if (isOurs(m)) {
        ours++;
        if (!first) first = m;
      } else theirs++;
    }
    const last = after.length ? after[after.length - 1]! : null;
    const minutes = first ? Math.round((first.at - leadAt) / 60000) : null;
    return {
      replied: !!first,
      firstReplyAt: first ? new Date(first.at).toISOString() : null,
      responseMinutes: minutes,
      ourMessages: ours,
      theirMessages: theirs,
      exchanged: ours + theirs,
      lastAt: last ? new Date(last.at).toISOString() : null,
      lastDirection: last ? (isOurs(last) ? 'us' : 'them') : null,
      awaitingUs: !!last && !isOurs(last),
      autoReplyLikely: minutes != null && minutes >= 0 && minutes < autoUnder,
      found: notifFound || after.length > 0,
    };
  }

  function classifyThread(messages: ThreadMessage[], receivedAt: string): ThreadOutcome {
    const out: ThreadOutcome = { phoneFollowup: null, declined: false, declineReason: null, bookedInThread: false, matched: [] };
    const leadAt = Date.parse(receivedAt);
    if (!Number.isFinite(leadAt)) return out;
    for (const m of conversation(messages, leadAt).after) {
      const text = (m.text ?? '').replace(/\s+/g, ' ');
      if (!text.trim()) continue;
      const ours = isOurs(m);
      const phone = firstMatch(ours ? R.phoneUs : R.phoneThem, text);
      if (phone && !out.phoneFollowup) {
        out.phoneFollowup = ours ? 'us' : 'them';
        out.matched.push(phone);
      }
      if (ours) {
        const b = firstMatch(R.booked, text);
        if (b) {
          out.bookedInThread = true;
          out.matched.push(b);
        }
      } else if (!out.declined) {
        // A decline is something THEY say; reasons only after one is found.
        const dec = firstMatch(R.decline, text);
        if (dec) {
          out.declined = true;
          out.matched.push(dec);
          for (const { reason, rules: rr } of R.reasons) {
            const why = firstMatch(rr, text);
            if (why) {
              out.declineReason = reason;
              out.matched.push(why);
              break;
            }
          }
          if (!out.declineReason) out.declineReason = 'unspecified';
        }
      }
    }
    return out;
  }

  function stillAwaitingUs(lastDirection: 'us' | 'them' | null, o: ThreadOutcome): boolean {
    if (lastDirection !== 'them') return false;
    if (o.declined) return false;
    if (o.phoneFollowup === 'us') return false;
    return true;
  }

  function reachedVia(lead: LeadReachInput): ReachedVia {
    if (lead.booked || lead.status === 'booked') return 'booked';
    if (lead.response.replied) return 'email';
    if ((lead.phoneClicks ?? 0) > 0) return 'phone';
    if (lead.status && lead.status !== 'new') return 'worked';
    return null;
  }

  return {
    compliancePack: gate.compliancePack,
    mailbox,
    summarizeThread,
    classifyThread,
    analyzeLead(messages, receivedAt) {
      const response = summarizeThread(messages, receivedAt);
      const outcome = classifyThread(messages, receivedAt);
      return { response, outcome, awaitingUs: stillAwaitingUs(response.lastDirection, outcome) };
    },
    stillAwaitingUs,
    aggregate(rows, minLeads = 3) {
      const replied = rows.filter((r) => r.response.replied);
      // Negative times (clock skew, mismatched thread) stay "replied" but
      // leave the timing stats, or the median goes below zero.
      const times = replied.map((r) => r.response.responseMinutes).filter((m): m is number => m != null && m >= 0);
      const byBucket = new Map<SpeedBucket, { leads: number; booked: number }>();
      for (const r of rows) {
        const b = speedBucket(r.response.replied ? r.response.responseMinutes : null);
        const e = byBucket.get(b) ?? { leads: 0, booked: 0 };
        e.leads++;
        if (r.booked) e.booked++;
        byBucket.set(b, e);
      }
      const notReplied = rows.filter((r) => !r.response.replied);
      return {
        leads: rows.length,
        repliedByEmail: replied.length,
        noReplyNoContact: notReplied.filter((r) => (r.status || 'new') === 'new').length,
        noReplyButWorked: notReplied.filter((r) => (r.status || 'new') !== 'new').length,
        medianResponseMinutes: median(times),
        withinHour: times.filter((m) => m < 60).length,
        withinDay: times.filter((m) => m >= 60 && m < 1440).length,
        overDay: times.filter((m) => m >= 1440).length,
        medianExchanged: median(replied.map((r) => r.response.exchanged)),
        awaitingUs: rows.filter((r) => r.response.awaitingUs).length,
        autoReplyLikely: rows.filter((r) => r.response.autoReplyLikely).length,
        bookedBySpeed: SPEED_BUCKETS.filter((b) => byBucket.has(b)).map((b) => {
          const e = byBucket.get(b)!;
          return { bucket: b, ...e, rate: e.leads ? e.booked / e.leads : null, lowSample: e.leads < minLeads };
        }),
      };
    },
    reachedVia,
    summarizeReach(leads) {
      const out: ReachSummary = { leads: leads.length, booked: 0, email: 0, phone: 0, worked: 0, unreached: 0, phoneTrackable: 0 };
      for (const l of leads) {
        if (l.phoneClicks !== undefined) out.phoneTrackable++;
        const v = reachedVia(l);
        if (v) out[v]++;
        else out.unreached++;
      }
      return out;
    },
    summarizeOutcomes(outcomes) {
      const counts = new Map<string, number>();
      let us = 0, them = 0, declined = 0, booked = 0;
      for (const o of outcomes) {
        if (o.phoneFollowup === 'us') us++;
        if (o.phoneFollowup === 'them') them++;
        if (o.bookedInThread) booked++;
        if (o.declined) {
          declined++;
          const k = o.declineReason ?? 'unspecified';
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
      }
      return {
        threads: outcomes.length,
        phoneFollowupUs: us,
        phoneFollowupThem: them,
        declined,
        bookedInThread: booked,
        byReason: [...counts.entries()]
          .map(([reason, count]) => ({ reason, label: labels.get(reason) ?? reason, count }))
          .sort((a, b) => b.count - a.count),
      };
    },
  };
}
