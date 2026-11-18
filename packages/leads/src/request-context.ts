import type { ConversionConfig, RequestContext } from '@jeldon/config';

export type RequestContextResult =
  | { configured: true; context: RequestContext; clusterId: string | null }
  | { configured: false; reason: string };

/**
 * The request-sheet / end-cap copy for a page, from its topic-cluster ids.
 * First cluster with an entry wins, merged over `default`. The copy is pack
 * data (`conversion.requestContexts`); the engine ships none, so an
 * unconfigured pack gets an explicit `configured: false`, not empty strings
 * that would render as a blank CTA.
 */
export function requestContextFor(clusterIds: string[], cfg: ConversionConfig | undefined): RequestContextResult {
  const rc = cfg?.requestContexts;
  if (!rc) return { configured: false, reason: 'conversion.requestContexts is not set in the Domain Pack' };
  for (const id of clusterIds) {
    const c = rc.byCluster[id];
    if (c) return { configured: true, context: { ...rc.default, ...c }, clusterId: id };
  }
  return { configured: true, context: { ...rc.default }, clusterId: null };
}
