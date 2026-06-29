/**
 * @jeldon/amplify types.
 *
 * The article shape the kit reads is intentionally narrow — slug + the
 * frontmatter/body fields the BoH amplify/carousel/newsletter endpoints
 * actually used. A host adapts its own article record to this.
 */

/** The minimal article view the amplify kit needs. Maps 1:1 to the fields the
 *  BoH endpoints read off `parse(file.content)`. */
export interface AmplifyArticle {
  slug: string;
  title: string;
  excerpt?: string;
  category?: string;
  tags?: string[];
  /** Full article body markdown (without frontmatter). */
  body: string;
  heroImage?: string;
  heroImageAlt?: string;
  readTime?: string;
  /** True while the article is still a draft — the kit notes the URL will 404. */
  isDraft?: boolean;
}

/** One channel's produced copy, keyed by channel id. */
export type AmplifyKit = Record<string, string>;

export interface GenerateKitResult {
  /** Per-channel copy keyed by `AmplifyChannel.id`. URLs are UTM-tagged. */
  kit: AmplifyKit;
  meta: { url: string; title: string; isDraft: boolean };
  model: string;
  usage?: LlmUsage;
}

export interface RegenerateChannelResult {
  channel: string;
  text: string;
  meta: { url: string; title: string; isDraft: boolean };
  model: string;
  usage?: LlmUsage;
}

/** One carousel text slide as the model returns it. */
export interface CarouselSlide {
  kicker?: string;
  body: string;
  footer?: string;
}

export interface GenerateCarouselResult {
  schemeId: string;
  scheme: { id: string; label: string; bg: string; fg: string; accent: string };
  schemes: Array<{ id: string; label: string; bg: string; fg: string; accent: string }>;
  slides: CarouselSlide[];
  heroImage: string | null;
  heroImageAlt: string | null;
  title: string;
  slug: string;
  articleUrl: string;
  model: string;
  usage?: LlmUsage;
}

export interface NewsletterContent {
  subject: string;
  body: string;
}

export interface LlmUsage {
  input_tokens: number;
  output_tokens: number;
}

/** A single tool the LLM call exposes, in Anthropic Messages tool shape. */
export interface LlmTool {
  name: string;
  description: string;
  // Loose by design — callers build JSON-schema-shaped objects.
  input_schema: Record<string, unknown>;
}

export interface LlmToolRequest {
  model: string;
  system: string;
  userMessage: string;
  maxTokens: number;
  tool: LlmTool;
}

export interface LlmToolResponse {
  /** The forced tool's `input` object, or null when the model produced none. */
  input: Record<string, unknown> | null;
  stopReason: string;
  usage?: LlmUsage;
}

/**
 * The single I/O boundary for the kit's model calls. Default adapter is
 * `AnthropicLlmClient`; tests inject a stub. Mirrors how @jeldon/aeo-audit
 * keeps every fetch behind an `EngineFn` so the logic is host-free.
 */
export interface LlmClient {
  /** Run a single forced-tool-use call and return the tool input. */
  callTool(req: LlmToolRequest): Promise<LlmToolResponse>;
}
