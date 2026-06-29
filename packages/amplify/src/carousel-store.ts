import type { AmplifyConfig, DomainPack } from '@jeldon/config';
import { defaultAmplifyConfig } from '@jeldon/config';
import type { Store } from '@jeldon/store';

/**
 * Carousel sidecar persistence, ported from BoH
 * `src/pages/api/admin/carousel/state/[slug].ts`. Persists per-slide *visual*
 * tweaks (BG images, opacity, typography overrides, logo toggle, seamless
 * backdrop) so they survive text regenerations and reloads. Text is NEVER
 * stored here — it's always rebuilt from the article via `generateCarousel`,
 * then the sidecar overlays by slide index at render time.
 *
 * Per the brief: persistence is via @jeldon/store (the GitHub/Fs `Store`
 * interface), not a direct GitHub coupling. The 409/422 re-fetch-and-retry
 * recovery the BoH PUT did by hand is now the Store's `saveDataFile` contract.
 */

export interface SidecarSlide {
  bgImageUrl?: string;
  imagePrompt?: string;
  bgImageOpacity?: number;
  kickerSize?: number;
  bodySize?: number;
  footerSize?: number;
  showLogo?: boolean;
  logoSize?: number;
}

export interface SidecarHero {
  imageUrl?: string;
  imagePrompt?: string;
  ctaSize?: number;
  brandSize?: number;
  brandText?: string;
}

export interface SidecarBackdrop {
  imageUrl: string;
  imagePrompt: string;
  startIndex: number;
  endIndex: number;
}

export interface CarouselSidecar {
  slides: SidecarSlide[];
  hero?: SidecarHero;
  backdrop?: SidecarBackdrop;
  updatedAt: string;
}

function resolveStateDir(pack: Pick<DomainPack, 'amplify'>): string {
  const amplify: AmplifyConfig = pack.amplify ?? defaultAmplifyConfig;
  return (amplify.carouselStateDir ?? 'src/data/carousel-state').replace(/\/$/, '');
}

/**
 * Reads + writes carousel sidecars through a `Store`. The path layout
 * (`<dir>/<slug>.json`) comes from `pack.amplify.carouselStateDir`.
 */
export class CarouselSidecarStore {
  private readonly dir: string;

  constructor(
    private readonly store: Store,
    pack: Pick<DomainPack, 'amplify'>,
  ) {
    this.dir = resolveStateDir(pack);
  }

  private path(slug: string): string {
    return `${this.dir}/${slug}.json`;
  }

  /** Read the sidecar for a slug. Returns `{ state: null, sha: null }` when
   *  none exists (the article was never carousel-customized). */
  async get(slug: string): Promise<{ state: CarouselSidecar | null; sha: string | null }> {
    const file = await this.store.getDataFile(this.path(slug));
    if (!file) return { state: null, sha: null };
    try {
      return { state: JSON.parse(file.content) as CarouselSidecar, sha: file.sha };
    } catch {
      // Corrupt sidecar — treat as absent so a fresh save can heal it.
      return { state: null, sha: file.sha };
    }
  }

  /**
   * Persist a sidecar. Stamps `updatedAt`, keeps only the visual fields, and
   * relies on the Store's conflict recovery. Pass the `sha` you read for
   * optimistic concurrency; `null` resolves the current sha first (the BoH PUT
   * behaviour where a missing sha is looked up before commit).
   */
  async put(
    slug: string,
    state: Pick<CarouselSidecar, 'slides' | 'hero' | 'backdrop'>,
    sha: string | null = null,
  ): Promise<{ sha: string; mergedFromConflict?: boolean }> {
    if (!Array.isArray(state.slides)) {
      throw new Error('Invalid carousel sidecar: `slides` must be an array.');
    }
    const next: CarouselSidecar = {
      slides: state.slides,
      hero: state.hero,
      backdrop: state.backdrop,
      updatedAt: new Date().toISOString(),
    };
    const content = JSON.stringify(next, null, 2) + '\n';
    const path = this.path(slug);

    let resolvedSha = sha;
    if (resolvedSha === null) {
      const existing = await this.store.getDataFile(path);
      resolvedSha = existing?.sha ?? null;
    }
    const result = await this.store.saveDataFile(
      path,
      content,
      resolvedSha,
      `carousel: update sidecar state for ${slug}`,
    );
    return { sha: result.sha, mergedFromConflict: result.mergedFromConflict };
  }
}
