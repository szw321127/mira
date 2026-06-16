import type { XhsCommercialWorkflow, XhsCommercialWorkflowInput, XhsPostInput } from './types';
import { analyzeXhsPost } from './post-analysis';
import { analyzeXhsAccount } from './account-analysis';
import { auditXhsImageTextPublishPackage } from './publish-audit';
import { buildXhsGenerationBrief } from './generation-brief';
import { buildXhsImageTextPublishPackage } from './publish-package';
import { normalizeXhsImportedAccount, normalizeXhsImportedPosts } from './imports';

export function buildXhsCommercialWorkflow(
  input: XhsCommercialWorkflowInput,
): XhsCommercialWorkflow {
  const importedAccount = input.account
    ? normalizeXhsImportedAccount(input.account)
    : undefined;
  const importedPosts = normalizeXhsImportedPosts(input.posts ?? []);
  const accountAnalysis = importedAccount
    ? analyzeXhsAccount(importedAccount.account)
    : undefined;
  const referencePostInputs = dedupeReferencePosts([
    ...(importedAccount?.account.posts ?? []),
    ...importedPosts.posts,
  ]);
  const referencePosts = referencePostInputs.map(analyzeXhsPost);
  const brief = buildXhsGenerationBrief({
    account: accountAnalysis,
    idea: input.idea,
    references: referencePosts,
  });
  const publishPackage = buildXhsImageTextPublishPackage({
    audience: input.audience,
    brief,
    idea: input.idea,
    outline: input.outline,
    pageCount: input.pageCount,
    tone: input.tone,
  });
  const audit = auditXhsImageTextPublishPackage(publishPackage);

  return {
    accountAnalysis,
    audit,
    brief,
    importedAccount,
    importedPosts,
    publishPackage,
    referencePosts,
    summary: {
      importedAccountPostCount: importedAccount?.account.posts.length ?? 0,
      importedStandalonePostCount: importedPosts.posts.length,
      ready: audit.ready,
      referenceCount: referencePosts.length,
      score: audit.score,
      topContentPillars:
        accountAnalysis?.contentPillars
          .slice(0, 3)
          .map((pillar) => pillar.name) ?? [],
    },
  };
}

function dedupeReferencePosts(posts: XhsPostInput[]) {
  const seen = new Set<string>();
  const uniquePosts: XhsPostInput[] = [];

  for (const post of posts) {
    const key = buildReferencePostKey(post);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniquePosts.push(post);
  }

  return uniquePosts;
}

function buildReferencePostKey(post: XhsPostInput) {
  if (post.url) {
    return `url:${post.url}`;
  }

  return `title:${post.title.trim()}`;
}
