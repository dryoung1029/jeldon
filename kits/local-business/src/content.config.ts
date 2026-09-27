/**
 * Content collections (Astro 5 content layer). Articles use the schema derived
 * from jeldon.config.ts; services, team and faqs are the kit's own. Directory
 * names come from kit.config.ts `collections`; collection NAMES stay neutral.
 */
import { defineCollection, z } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { buildArticleSchema } from '@jeldon/content-model';
import { pack } from './lib/pack';
import { kit } from '../kit.config';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: `./${pack.services.contentDir ?? 'src/content/articles'}` }),
  schema: buildArticleSchema(pack),
});

const services = defineCollection({
  loader: glob({ pattern: '**/*.md', base: `./${kit.collections.services}` }),
  schema: z.object({
    name: z.string(),
    /** One line under the name on listings. */
    tagline: z.string(),
    /** Who this is for, in a few words. */
    audience: z.string(),
    order: z.number().default(50),
    /** Key in kit.config booking.plans, or a full URL. Blank = contact form. */
    signupPlanKey: z.string().optional(),
    signupUrl: z.string().url().optional(),
    signupLabel: z.string().optional(),
    price: z.string().optional(),
    duration: z.string().optional(),
    format: z.string().optional(),
    /** schema.org serviceType, e.g. "Fitness training", "Chiropractic care". */
    serviceType: z.string().optional(),
    heroImage: z.string().optional(),
    heroImageAlt: z.string().optional(),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
    faqs: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
    draft: z.boolean().default(false),
  }),
});

const team = defineCollection({
  loader: glob({ pattern: '**/*.md', base: `./${kit.collections.team}` }),
  schema: z.object({
    name: z.string(),
    role: z.string(),
    credentials: z.string().optional(),
    order: z.number().default(50),
    photo: z.string().optional(),
    photoAlt: z.string().optional(),
    specialties: z.array(z.string()).default([]),
    links: z.array(z.object({ label: z.string(), url: z.string().url() })).default([]),
    draft: z.boolean().default(false),
  }),
});

const faqs = defineCollection({
  loader: file(`./${kit.collections.faqs}`),
  schema: z.object({
    /** Which page(s) show this FAQ: home, faq, primary-cta, pricing, or a service slug. */
    pages: z.array(z.string()),
    order: z.number().default(50),
    question: z.string(),
    answer: z.string(),
  }),
});

export const collections = { articles, services, team, faqs };
