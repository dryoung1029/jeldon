/**
 * @jeldon/ideation — where article ideas come from, and where they are kept.
 *
 *   - mineTranscript()       transcript miner (published or private recordings)
 *   - runRedditRadar()       read-only Reddit listening run
 *   - scoreRedditTargets()   reply targets vs "out-publish it" threads
 *   - proposeRedditBriefs()  engine-cited threads + questions → briefs
 *   - topicEntrySchema / TopicBacklog   one schema for backlog reader and writer
 *
 * Every prompt is built from the Domain Pack. Nothing posts anywhere.
 */

export type { IdeationPack, InventoryArticle, TopicProposal, LlmUsage } from './types.js';
export { primaryAuthorName, ideationVoiceBlock } from './types.js';

export {
  TOPIC_STATUSES,
  topicEntrySchema,
  topicInputSchema,
  parseBacklog,
  serializeBacklog,
  upsertTopics,
  patchTopic,
  deleteTopic,
  makeTopicId,
  isPlaceholderId,
  backlogPromptBlocks,
  topicSourceGuidance,
  TopicBacklog,
  type TopicStatus,
  type TopicEntry,
  type TopicInput,
  type Backlog,
  type BacklogParseResult,
  type UpsertResult,
  type PatchResult,
  type BacklogWriteResult,
} from './backlog.js';

export {
  TIMESTAMP_ANCHOR_RE,
  hasTimestampAnchors,
  formatTimestamp,
  formatTranscriptSegments,
  prepareTranscript,
  type TranscriptSegment,
  type FetchedTranscript,
  type TranscriptFetcher,
  type MineInput,
  type MinedSource,
  type PreparedTranscript,
} from './transcript.js';

export { YoutubeTranscriptFetcher, extractVideoId, type YoutubeTranscriptFetcherOptions } from './youtube.js';

export {
  MINER_TOOL_NAME,
  minerConfig,
  buildMinerSystem,
  buildMinerTool,
  buildMinerUserMessage,
  mineTranscript,
  type MineDeps,
  type MineResult,
} from './miner.js';

export { RedditReader, redditSources, parseAtom, type RedditPost, type RedditSource, type RedditReaderOptions } from './reddit/fetch.js';
export {
  KIND_RANK,
  runRedditRadar,
  redditConfig,
  brandExclusions,
  matchTerms,
  competitorNames,
  isQuestionTitle,
  rotateByDay,
  type RadarKind,
  type RadarItem,
  type RadarSnapshot,
  type RadarRunResult,
  type RadarDeps,
} from './reddit/radar.js';
export {
  scoreRedditTargets,
  citedThreadsFromSnapshot,
  redditThreadId,
  threadKey,
  ageInDays,
  type CitedBy,
  type CitedThread,
  type RedditTarget,
  type TargetAction,
  type ScoreTargetsResult,
} from './reddit/targets.js';
export {
  REDDIT_BRIEF_TOOL_NAME,
  buildRedditBriefSystem,
  buildRedditBriefTool,
  buildRedditBriefMessage,
  proposeRedditBriefs,
  titleFromThreadUrl,
  type RedditBriefInput,
  type RedditBriefDeps,
  type RedditBriefResult,
} from './reddit/briefs.js';
