import { describe, expect, it } from 'vitest';
import { createMailboxTracker, mailboxGate, MailboxComplianceError, type ThreadMessage } from '../src/compliance.js';

const MAILBOX = 'desk@example.org';
const PATIENT = 'person@example.net';
const allowed = {
  compliance: {
    pack: 'hipaa',
    mailbox: { enabled: true, address: MAILBOX, notificationWindowMinutes: 10, autoReplyUnderMinutes: 2 },
  },
};
const T0 = Date.parse('2026-10-20T15:00:00Z');
const min = (n: number) => T0 + n * 60_000;

describe('compliance gate', () => {
  it('refuses to run without a compliance pack', () => {
    expect(mailboxGate({})).toMatchObject({ allowed: false, reason: 'no_compliance_pack' });
    expect(mailboxGate({ compliance: { pack: 'none', mailbox: { enabled: true, notificationWindowMinutes: 10, autoReplyUnderMinutes: 2 } } })).toMatchObject({
      allowed: false,
      reason: 'no_compliance_pack',
    });
    expect(() => createMailboxTracker({})).toThrow(MailboxComplianceError);
  });

  it('refuses when the pack is set but the mailbox is not enabled', () => {
    expect(mailboxGate({ compliance: { pack: 'hipaa' } })).toMatchObject({ allowed: false, reason: 'mailbox_not_enabled' });
    expect(() => createMailboxTracker({ compliance: { pack: 'hipaa' } })).toThrow(/mailbox.enabled/);
  });

  it('refuses without a mailbox address, and runs once everything is set', () => {
    const noAddr = { compliance: { pack: 'hipaa', mailbox: { enabled: true, notificationWindowMinutes: 10, autoReplyUnderMinutes: 2 } } };
    expect(() => createMailboxTracker(noAddr)).toThrow(/address/);
    expect(createMailboxTracker(allowed).mailbox).toBe(MAILBOX);
  });
});

describe('mailbox tracker', () => {
  const t = createMailboxTracker(allowed);

  it('does not count the system notification as a reply', () => {
    const notificationOnly: ThreadMessage[] = [{ fromEmail: MAILBOX, at: min(0.1), text: 'New contact: please call back' }];
    const r = t.summarizeThread(notificationOnly, new Date(T0).toISOString());
    expect(r.replied).toBe(false);
    expect(r.found).toBe(true);
    expect(r.ourMessages).toBe(0);
    // Nor does the notification's own text get classified.
    expect(t.classifyThread(notificationOnly, new Date(T0).toISOString()).matched).toEqual([]);

    const withReply = [...notificationOnly, { fromEmail: MAILBOX.toUpperCase(), at: min(45), text: 'Thanks for reaching out' }];
    expect(t.summarizeThread(withReply, new Date(T0).toISOString())).toMatchObject({ replied: true, responseMinutes: 45, ourMessages: 1 });
  });

  it('reduces text to rule codes and never returns the text', () => {
    const msgs: ThreadMessage[] = [
      { fromEmail: MAILBOX, at: min(0), text: 'notification' },
      { fromEmail: MAILBOX, at: min(30), text: 'Happy to help, when works for you?' },
      { fromEmail: PATIENT, at: min(90), text: 'Thanks but I will pass, turns out you are out of network for my plan with Zephyrcare.' },
    ];
    const a = t.analyzeLead(msgs, new Date(T0).toISOString());
    expect(a.outcome.declined).toBe(true);
    expect(a.outcome.declineReason).toBe('insurance');
    expect(a.outcome.matched).toEqual(['decline.will-pass', 'why.out-of-network']);
    expect(a.awaitingUs).toBe(false); // a decline closes it
    const json = JSON.stringify(a);
    for (const word of ['Zephyrcare', 'network for my plan', 'Happy to help', 'turns out']) expect(json).not.toContain(word);
  });

  it('classifies decline reasons only after a decline is detected', () => {
    const question: ThreadMessage[] = [{ fromEmail: PATIENT, at: min(20), text: 'Do you take my insurance? Is it out of network?' }];
    const o = t.classifyThread(question, new Date(T0).toISOString());
    expect(o.declined).toBe(false);
    expect(o.declineReason).toBeNull();
    expect(o.matched).toEqual([]);

    // Our own "no longer need" is not their decline.
    const ours: ThreadMessage[] = [{ fromEmail: MAILBOX, at: min(20), text: 'If you no longer need the visit, just let us know.' }];
    expect(t.classifyThread(ours, new Date(T0).toISOString()).declined).toBe(false);

    const bare: ThreadMessage[] = [{ fromEmail: PATIENT, at: min(20), text: 'Not interested anymore.' }];
    expect(t.classifyThread(bare, new Date(T0).toISOString())).toMatchObject({ declined: true, declineReason: 'unspecified' });
  });

  it('keeps "please call me" on our list and takes "we will call" off it', () => {
    const them: ThreadMessage[] = [{ fromEmail: PATIENT, at: min(20), text: 'Could you call me tomorrow?' }];
    const a = t.analyzeLead(them, new Date(T0).toISOString());
    expect(a.outcome.phoneFollowup).toBe('them');
    expect(a.awaitingUs).toBe(true);
    const us: ThreadMessage[] = [
      { fromEmail: PATIENT, at: min(20), text: 'Hello' },
      { fromEmail: MAILBOX, at: min(30), text: "We'll call you this afternoon." },
      { fromEmail: PATIENT, at: min(40), text: 'Great' },
    ];
    expect(t.analyzeLead(us, new Date(T0).toISOString()).awaitingUs).toBe(false);
  });

  it('ranks reachedVia booked > email > phone tap > worked by hand', () => {
    const replied = t.summarizeThread([{ fromEmail: MAILBOX, at: min(60) }], new Date(T0).toISOString());
    const silent = t.summarizeThread([], new Date(T0).toISOString());
    expect(t.reachedVia({ response: replied, status: 'contacted', booked: true, phoneClicks: 2 })).toBe('booked');
    expect(t.reachedVia({ response: replied, status: 'contacted', booked: false, phoneClicks: 2 })).toBe('email');
    expect(t.reachedVia({ response: silent, status: 'contacted', booked: false, phoneClicks: 2 })).toBe('phone');
    expect(t.reachedVia({ response: silent, status: 'contacted', booked: false })).toBe('worked');
    expect(t.reachedVia({ response: silent, status: 'new', booked: false, phoneClicks: 0 })).toBeNull();
    const s = t.summarizeReach([
      { response: silent, status: 'new', booked: false, phoneClicks: 0 },
      { response: silent, status: 'new', booked: false },
    ]);
    expect(s).toMatchObject({ unreached: 2, phoneTrackable: 1 });
  });

  it('flags low-sample speed buckets and likely autoresponders', () => {
    const fast = t.summarizeThread([{ fromEmail: MAILBOX, at: min(1) }], new Date(T0).toISOString());
    // min(1) is within the 10-minute notification window, so it IS the notification.
    expect(fast.replied).toBe(false);
    const auto = t.summarizeThread([{ fromEmail: MAILBOX, at: min(0) }, { fromEmail: MAILBOX, at: min(1) }], new Date(T0).toISOString());
    expect(auto).toMatchObject({ replied: true, autoReplyLikely: true });
    const agg = t.aggregate([{ response: auto, status: 'new', booked: true }]);
    expect(agg.bookedBySpeed).toEqual([{ bucket: 'under-1h', leads: 1, booked: 1, rate: 1, lowSample: true }]);
  });
});
