import type { TopicCluster, TopicClustersConfig } from '@jeldon/config';

/**
 * Topic-cluster membership. Ported from BoH `src/lib/topic-clusters.ts`.
 *
 * Curated rather than tag-driven: a real library carries hundreds of tags,
 * most used once. Each cluster is a hand-picked set of tags, series and slug
 * hints, and an article can belong to several. Pure, so scripts and tests can
 * use it outside a build.
 */

export interface ClusterMemberInput {
  slug: string;
  tags: string[];
  series?: string | null;
}

/** Cluster ids an article belongs to. Tags compare case-insensitively; slug
 *  hints match whole hyphen-delimited segments on both sides, never a bare
 *  substring ("hip" must not match "c-hip-ractic", "va" not "-va-lley"). */
export function articleClusterIds(article: ClusterMemberInput, clusters: TopicCluster[]): string[] {
  const tags = new Set(article.tags.map((t) => t.toLowerCase().trim()));
  const seg = `-${article.slug.toLowerCase()}-`;
  return clusters
    .filter(
      (c) =>
        c.tags.some((t) => tags.has(t.toLowerCase().trim())) ||
        (!!article.series && !!c.series?.includes(article.series)) ||
        !!c.slugHints?.some((h) => seg.includes(`-${h.toLowerCase()}-`)),
    )
    .map((c) => c.id);
}

/** Clusters that get a page in this build: the same threshold the route uses,
 *  so nothing links to a cluster page that does not exist. Pass live articles. */
export function liveClusterIds(articles: ClusterMemberInput[], cfg: TopicClustersConfig): Set<string> {
  const min = cfg.minLiveArticles ?? 2;
  const counts = new Map<string, number>();
  for (const a of articles) for (const id of articleClusterIds(a, cfg.clusters)) counts.set(id, (counts.get(id) ?? 0) + 1);
  return new Set([...counts].filter(([, n]) => n >= min).map(([id]) => id));
}

/** Members of one cluster, in input order. */
export function clusterMembers<T extends ClusterMemberInput>(clusterId: string, articles: T[], clusters: TopicCluster[]): T[] {
  return articles.filter((a) => articleClusterIds(a, clusters).includes(clusterId));
}

/** The cluster pages to generate: each live cluster with its members. */
export function clusterPages<T extends ClusterMemberInput>(
  articles: T[],
  cfg: TopicClustersConfig,
): Array<{ cluster: TopicCluster; members: T[] }> {
  const min = cfg.minLiveArticles ?? 2;
  return cfg.clusters
    .map((cluster) => ({ cluster, members: clusterMembers(cluster.id, articles, cfg.clusters) }))
    .filter((p) => p.members.length >= min);
}

/** Path of a cluster page, e.g. `/articles/topic/low-back-spine/`. */
export function clusterPath(clusterId: string, cfg: Pick<TopicClustersConfig, 'pathPrefix'>): string {
  const prefix = (cfg.pathPrefix ?? '/articles/topic/').replace(/^\/?/, '/').replace(/\/?$/, '/');
  return `${prefix}${clusterId}/`;
}
