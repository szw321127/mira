export type XhsMetricValue = number | string | null | undefined;

export interface XhsPostMetrics {
  collects?: XhsMetricValue;
  comments?: XhsMetricValue;
  likes?: XhsMetricValue;
  shares?: XhsMetricValue;
}

interface NormalizedXhsPostMetrics {
  collects: number;
  comments: number;
  likes: number;
  shares: number;
}

export interface XhsPostInput {
  author?: string;
  content?: string;
  images?: string[];
  metrics?: XhsPostMetrics;
  publishTime?: string;
  tags?: string[];
  title: string;
  url?: string;
  videoUrl?: string;
}

export interface XhsAccountInput {
  bio?: string;
  followers?: XhsMetricValue;
  name: string;
  posts: XhsPostInput[];
  url?: string;
}

export interface XhsPostAnalysis {
  contentAngles: string[];
  engagement: {
    collects: number;
    comments: number;
    likes: number;
    shares: number;
    total: number;
  };
  format: 'image-text' | 'text' | 'video';
  generationHints: string[];
  post: XhsPostInput;
  tagPatterns: string[];
  viralSignals: string[];
}

export interface XhsAccountAnalysis {
  contentPillars: Array<{ count: number; name: string }>;
  nextActions: string[];
  snapshot: {
    bio: string;
    followers: number;
    name: string;
    postCount: number;
    url?: string;
  };
  topPosts: XhsPostInput[];
}

export interface XhsGenerationBriefInput {
  account?: XhsAccountAnalysis;
  idea: string;
  references: XhsPostAnalysis[];
}

export interface XhsGenerationBrief {
  idea: string;
  promptAdditions: string[];
  recommendedSections: string[];
  sourcePatterns: string[];
}

export type XhsOutlineStrategy = 'checklist' | 'pain-point' | 'step-by-step';

export interface XhsOutlineCandidateInput {
  audience?: string;
  brief?: XhsGenerationBrief;
  idea: string;
}

export interface XhsOutlineCandidate {
  audience: string;
  estimatedPageCount: number;
  id: string;
  idea: string;
  outline: string[];
  selectionReason: string;
  sourcePatterns: string[];
  strategy: XhsOutlineStrategy;
  title: string;
}

export interface XhsImageTextPublishPackageInput {
  audience?: string;
  brief?: XhsGenerationBrief;
  idea: string;
  outline?: string[];
  pageCount?: number;
  tone?: string;
}

export interface XhsImageTextPage {
  body: string[];
  designNotes: string[];
  headline: string;
  imagePrompt: string;
  pageNumber: number;
  role: 'content' | 'cover' | 'summary';
}

export interface XhsImageTextPublishPackage {
  caption: string;
  copyBlocks: {
    caption: string;
    hashtags: string;
    pageText: string;
    publishText: string;
    title: string;
  };
  hashtags: string[];
  idea: string;
  imagePromptPack: string[];
  pages: XhsImageTextPage[];
  platform: 'xiaohongshu';
  publishingChecklist: string[];
  titleCandidates: string[];
}

export type XhsPublishReadinessCheck =
  | 'caption'
  | 'copy'
  | 'cover'
  | 'hashtags'
  | 'pages'
  | 'visuals';

export interface XhsPublishAuditIssue {
  check: XhsPublishReadinessCheck;
  message: string;
  severity: 'blocker' | 'warning';
}

export interface XhsPublishPackageAudit {
  blockers: XhsPublishAuditIssue[];
  passedChecks: XhsPublishReadinessCheck[];
  ready: boolean;
  repairActions: string[];
  score: number;
  warnings: XhsPublishAuditIssue[];
}

export type XhsImportedContentSource =
  | 'browser'
  | 'manual'
  | 'provider'
  | 'unknown';

export interface XhsImportedPostRecord {
  raw: Record<string, unknown>;
  source: XhsImportedContentSource;
  sourceId?: string;
}

export interface XhsImportDroppedRecord {
  reason: 'duplicate' | 'missing-title';
  source: XhsImportedContentSource;
  sourceId?: string;
}

export interface XhsImportSourceRecord {
  normalizedId: string;
  rawId?: string;
  source: XhsImportedContentSource;
  sourceId?: string;
  url?: string;
}

export interface XhsImportedPostsNormalization {
  dropped: XhsImportDroppedRecord[];
  posts: XhsPostInput[];
  sources: XhsImportSourceRecord[];
}

export interface XhsImportedAccountRecord {
  raw: Record<string, unknown>;
  source: XhsImportedContentSource;
  sourceId?: string;
}

export interface XhsImportedAccountNormalization {
  account: XhsAccountInput;
  dropped: XhsImportDroppedRecord[];
  source: XhsImportSourceRecord;
  sources: XhsImportSourceRecord[];
}

export interface XhsCommercialWorkflowInput {
  account?: XhsImportedAccountRecord;
  audience?: string;
  idea: string;
  outline: string[];
  pageCount?: number;
  posts?: XhsImportedPostRecord[];
  tone?: string;
}

export interface XhsCommercialWorkflowSummary {
  importedAccountPostCount: number;
  importedStandalonePostCount: number;
  ready: boolean;
  referenceCount: number;
  score: number;
  topContentPillars: string[];
}

export interface XhsCommercialWorkflow {
  accountAnalysis?: XhsAccountAnalysis;
  audit: XhsPublishPackageAudit;
  brief: XhsGenerationBrief;
  importedAccount?: XhsImportedAccountNormalization;
  importedPosts: XhsImportedPostsNormalization;
  publishPackage: XhsImageTextPublishPackage;
  referencePosts: XhsPostAnalysis[];
  summary: XhsCommercialWorkflowSummary;
}

export type XhsResearchMode = 'deep' | 'quick';

export type XhsResearchConfidence = 'high' | 'low' | 'medium';

export type XhsResearchStatus =
  | 'completed'
  | 'completed_with_warning'
  | 'fallback_no_samples';

export interface XhsSearchKeywordInput {
  extraKeywords?: string[];
  idea: string;
  mode?: XhsResearchMode;
}

export interface XhsPopularSampleInput extends XhsPostInput {
  keyword?: string;
  sourceId?: string;
}

export interface XhsResearchSourceSummary {
  engagementTotal: number;
  interactionSummary: string;
  matchedKeyword: string;
  matchReason: string;
  sourceId: string;
  title: string;
  url?: string;
}

export interface XhsPopularSamplesSummary {
  avoidPatterns: string[];
  contentAngles: string[];
  hookPatterns: string[];
  outlinePatterns: string[];
  standoutSamples: XhsResearchSourceSummary[];
  tagPatterns: string[];
}

export interface XhsPopularSamplesAnalysis {
  confidence: XhsResearchConfidence;
  failedKeywords: string[];
  idea: string;
  keywords: string[];
  sampleCount: number;
  status: XhsResearchStatus;
  summary: XhsPopularSamplesSummary;
  warnings: string[];
}

export interface XhsPopularSamplesAnalysisInput {
  failedKeywords?: string[];
  idea: string;
  keywords: string[];
  samples: XhsPopularSampleInput[];
  warnings?: string[];
}

export interface XhsResearchBackedOutlineInput {
  analysis: XhsPopularSamplesAnalysis;
  audience?: string;
  idea: string;
}
