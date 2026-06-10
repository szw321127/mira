import type {
  XhsAccountAnalysis,
  XhsImageTextPublishPackage,
  XhsImportedAccountNormalization,
  XhsImportedPostsNormalization,
  XhsPostAnalysis,
  XhsPublishPackageAudit,
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
