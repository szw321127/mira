import type {
  XhsAccountAnalysis,
  XhsImageTextPublishPackage,
  XhsImportedAccountNormalization,
  XhsImportedPostsNormalization,
  XhsPostAnalysis,
  XhsPublishPackageAudit,
  XhsPopularSamplesAnalysis,
  XhsResearchMode,
} from '@rednote/agent/xhs-analysis';
import type { AdminContentProviderType } from '../admin-content-providers/admin-content-providers.types';

export type ImportXhsPostInput = {
  conversationId?: string;
  noteId?: string;
  providerType?: AdminContentProviderType;
  url?: string;
};

export type ImportXhsAccountInput = {
  conversationId?: string;
  limit?: number;
  providerType?: AdminContentProviderType;
  url?: string;
  userId?: string;
};

export type RepairXhsPublishPackageInput = {
  idea: string;
  publishPackage: XhsImageTextPublishPackage;
  repairActions?: string[];
};

export type BuildXhsResearchOutlinesInput = {
  conversationId: string;
  idea: string;
  mode?: XhsResearchMode;
};

export type XhsProviderImportSummary = {
  complianceNote: string;
  endpoint: string;
  rateLimitPerMinute: number | null;
  sourceId: string;
  type: AdminContentProviderType;
};

export type XhsReferenceKind = 'account' | 'post';

export type SavedXhsReference = {
  conversationId: string;
  createdAt: Date;
  id: string;
  kind: XhsReferenceKind;
  sourceId: string;
  title: string;
};

export type XhsStoredReference = {
  analysis: unknown;
  conversationId: string;
  createdAt: Date;
  id: string;
  imported: unknown;
  kind: XhsReferenceKind;
  providerEndpoint: string | null;
  providerType: string;
  reference: SavedXhsReference;
  sourceId: string;
  sourceUrl: string | null;
  title: string;
  updatedAt: Date;
};

export type RepairedXhsPublishPackage = {
  audit: XhsPublishPackageAudit;
  publishPackage: XhsImageTextPublishPackage;
  repaired: boolean;
  summary: {
    ready: boolean;
    repairActionCount: number;
    score: number;
  };
};

export type ImportedXhsPostAnalysis = {
  analysis: XhsPostAnalysis;
  imported: XhsImportedPostsNormalization;
  provider: XhsProviderImportSummary;
  reference?: SavedXhsReference;
};

export type ImportedXhsAccountAnalysis = {
  analysis: XhsAccountAnalysis;
  imported: XhsImportedAccountNormalization;
  provider: XhsProviderImportSummary;
  reference?: SavedXhsReference;
};

export type XhsResearchRunView = {
  confidence: XhsPopularSamplesAnalysis['confidence'];
  createdAt: Date;
  failedKeywords: string[];
  id: string;
  idea: string;
  keywords: string[];
  mode: XhsResearchMode;
  providerEndpoint: string | null;
  providerType: AdminContentProviderType;
  sampleCount: number;
  status: XhsPopularSamplesAnalysis['status'];
  summary: XhsPopularSamplesAnalysis['summary'];
  warnings: string[];
};

export type XhsResearchOutlineBatchView = {
  batchNo: number;
  conversationId: string;
  createdAt: Date;
  id: string;
  outlines: Array<{
    batchId: string;
    createdAt: Date;
    hook: string;
    id: string;
    label: string;
    points: string[];
    position: number;
    title: string;
    tone: string;
    updatedAt: Date;
  }>;
  prompt: string;
};

export type XhsResearchOutlinesResult = {
  batch: XhsResearchOutlineBatchView;
  research: XhsResearchRunView;
};
