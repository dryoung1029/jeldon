/**
 * The ONE place the kit reads the compliance pack. A health consumer that
 * selects `compliance.pack: 'hipaa'` gets the "no health details in the form"
 * copy and the BAA note automatically; everyone else gets the kit's neutral
 * copy (or the kit.config override).
 */
export interface ComplianceCopy {
  contactHint: string;
  privacyHealthSection: { heading: string; text: string } | null;
  articleDisclaimer: string | null;
}

export function complianceCopy(pack: string | undefined, overrides: { contactHint?: string; articleDisclaimer?: string } = {}): ComplianceCopy {
  if (pack === 'hipaa') {
    return {
      contactHint:
        'Please do not include health details, symptoms, or medical history in this form. It is not a secure medical channel — we will talk about your history in person or by phone.',
      privacyHealthSection: {
        heading: 'Health information',
        text:
          'This website is not a secure medical channel and is not intended for protected health information. Messages you send through the contact form are handled by our email provider and, where noted, our practice-management system under a Business Associate Agreement (BAA). Please share health details with us in person or by phone.',
      },
      articleDisclaimer:
        overrides.articleDisclaimer ??
        'This article is general education, not medical advice, and does not create a provider–patient relationship. Talk with your own clinician about your situation.',
    };
  }
  return {
    contactHint: overrides.contactHint ?? '',
    privacyHealthSection: null,
    articleDisclaimer: overrides.articleDisclaimer ?? null,
  };
}
