import type { XhsImageTextPublishPackage, XhsPublishAuditIssue, XhsPublishPackageAudit, XhsPublishReadinessCheck } from './types';
import { uniqueClean } from './shared';

export function auditXhsImageTextPublishPackage(
  publishPackage: XhsImageTextPublishPackage,
): XhsPublishPackageAudit {
  const passedChecks: XhsPublishReadinessCheck[] = [];
  const blockers: XhsPublishAuditIssue[] = [];
  const warnings: XhsPublishAuditIssue[] = [];

  evaluateCover(publishPackage, passedChecks, blockers, warnings);
  evaluatePages(publishPackage, passedChecks, blockers, warnings);
  evaluateCopy(publishPackage, passedChecks, blockers, warnings);
  evaluateCaption(publishPackage, passedChecks, blockers, warnings);
  evaluateVisuals(publishPackage, passedChecks, blockers, warnings);
  evaluateHashtags(publishPackage, passedChecks, blockers, warnings);

  const score = calculatePublishAuditScore(passedChecks, blockers, warnings);

  return {
    blockers,
    passedChecks,
    ready: blockers.length === 0 && score >= 80,
    repairActions: buildAuditRepairActions(blockers, warnings),
    score,
    warnings,
  };
}

function evaluateCover(
  publishPackage: XhsImageTextPublishPackage,
  passedChecks: XhsPublishReadinessCheck[],
  blockers: XhsPublishAuditIssue[],
  warnings: XhsPublishAuditIssue[],
) {
  const cover = publishPackage.pages.find((page) => page.role === 'cover');

  if (!cover) {
    blockers.push({
      check: 'cover',
      message: '缺少封面页，用户第一眼无法判断内容价值。',
      severity: 'blocker',
    });
    return;
  }

  if (cover.headline.trim().length < 8) {
    warnings.push({
      check: 'cover',
      message: '封面标题偏短，建议补充明确对象、结果或痛点。',
      severity: 'warning',
    });
    return;
  }

  passedChecks.push('cover');
}

function evaluatePages(
  publishPackage: XhsImageTextPublishPackage,
  passedChecks: XhsPublishReadinessCheck[],
  blockers: XhsPublishAuditIssue[],
  warnings: XhsPublishAuditIssue[],
) {
  if (publishPackage.pages.length < 4) {
    blockers.push({
      check: 'pages',
      message: '图文页数少于 4 页，信息密度不足。',
      severity: 'blocker',
    });
    return;
  }

  if (!publishPackage.pages.some((page) => page.role === 'summary')) {
    warnings.push({
      check: 'pages',
      message: '缺少总结页，建议补一页收藏清单或互动问题。',
      severity: 'warning',
    });
    return;
  }

  if (
    publishPackage.pages.some(
      (page) => !page.headline.trim() || page.body.length === 0,
    )
  ) {
    blockers.push({
      check: 'pages',
      message: '存在缺少标题或正文的分页。',
      severity: 'blocker',
    });
    return;
  }

  passedChecks.push('pages');
}

function evaluateCopy(
  publishPackage: XhsImageTextPublishPackage,
  passedChecks: XhsPublishReadinessCheck[],
  blockers: XhsPublishAuditIssue[],
  warnings: XhsPublishAuditIssue[],
) {
  const publishText = publishPackage.copyBlocks.publishText.trim();
  const hasTitle = publishPackage.titleCandidates.some((title) =>
    publishText.includes(title),
  );
  const hasHashtag = publishText.includes('#');

  if (publishText.length < 80 || !hasTitle || !hasHashtag) {
    blockers.push({
      check: 'copy',
      message: '可复制发布文本不完整，需要包含标题、正文和标签。',
      severity: 'blocker',
    });
    return;
  }

  if (/提示词|prompt|生成/.test(publishText)) {
    warnings.push({
      check: 'copy',
      message: '发布文本仍像生成提示，建议改成面向用户的自然表达。',
      severity: 'warning',
    });
    return;
  }

  passedChecks.push('copy');
}

function evaluateCaption(
  publishPackage: XhsImageTextPublishPackage,
  passedChecks: XhsPublishReadinessCheck[],
  blockers: XhsPublishAuditIssue[],
  warnings: XhsPublishAuditIssue[],
) {
  const caption = publishPackage.caption.trim();

  if (caption.length < 60) {
    blockers.push({
      check: 'caption',
      message: '正文 caption 太短，缺少具体场景、步骤或互动引导。',
      severity: 'blocker',
    });
    return;
  }

  if (!/[？?]/.test(caption) && !/评论|收藏|你/.test(caption)) {
    warnings.push({
      check: 'caption',
      message: '正文缺少轻互动，建议加入评论问题或收藏理由。',
      severity: 'warning',
    });
    return;
  }

  passedChecks.push('caption');
}

function evaluateVisuals(
  publishPackage: XhsImageTextPublishPackage,
  passedChecks: XhsPublishReadinessCheck[],
  blockers: XhsPublishAuditIssue[],
  warnings: XhsPublishAuditIssue[],
) {
  const pagePrompts = publishPackage.pages.map((page) =>
    page.imagePrompt.trim(),
  );
  const promptPack = publishPackage.imagePromptPack.map((prompt) =>
    prompt.trim(),
  );

  if (
    promptPack.length !== publishPackage.pages.length ||
    pagePrompts.some((prompt) => !prompt)
  ) {
    blockers.push({
      check: 'visuals',
      message: '图片提示词数量或内容不完整，无法生成完整图文页。',
      severity: 'blocker',
    });
    return;
  }

  if (!promptPack.every((prompt) => /手机|竖屏|小红书/.test(prompt))) {
    warnings.push({
      check: 'visuals',
      message: '图片提示词缺少小红书竖屏语境，可能影响出图一致性。',
      severity: 'warning',
    });
    return;
  }

  passedChecks.push('visuals');
}

function evaluateHashtags(
  publishPackage: XhsImageTextPublishPackage,
  passedChecks: XhsPublishReadinessCheck[],
  blockers: XhsPublishAuditIssue[],
  warnings: XhsPublishAuditIssue[],
) {
  const hashtags = uniqueClean(publishPackage.hashtags);

  if (hashtags.length < 3) {
    blockers.push({
      check: 'hashtags',
      message: '标签少于 3 个，建议覆盖人群、场景和内容品类。',
      severity: 'blocker',
    });
    return;
  }

  if (hashtags.length > 10) {
    warnings.push({
      check: 'hashtags',
      message: '标签数量偏多，建议保留最相关的 6-8 个。',
      severity: 'warning',
    });
    return;
  }

  passedChecks.push('hashtags');
}

function calculatePublishAuditScore(
  passedChecks: XhsPublishReadinessCheck[],
  blockers: XhsPublishAuditIssue[],
  warnings: XhsPublishAuditIssue[],
) {
  const score = passedChecks.length * 16 + (passedChecks.length ? 4 : 0);
  const penalty = blockers.length * 18 + warnings.length * 6;
  return Math.max(0, Math.min(100, score - penalty));
}

function buildAuditRepairActions(
  blockers: XhsPublishAuditIssue[],
  warnings: XhsPublishAuditIssue[],
) {
  const issues = [...blockers, ...warnings];

  if (!issues.length) {
    return ['发布包已达到基础发布标准，可进入人工微调或出图流程。'];
  }

  const actions = issues.map((issue) => {
    switch (issue.check) {
      case 'cover':
        return '补强封面：用一句话写清楚对象、痛点和可获得的结果。';
      case 'pages':
        return '补齐分页：至少保留封面、2-4 页正文和 1 页总结互动。';
      case 'copy':
        return '重写可复制发布文本：必须包含标题、正文段落和话题标签。';
      case 'caption':
        return '扩写 caption：加入具体场景、步骤、避坑或互动问题。';
      case 'visuals':
        return '补齐图片提示词：每一页都需要对应的小红书竖屏出图描述。';
      case 'hashtags':
        return '补齐标签：覆盖人群、场景、痛点、品类和可搜索关键词。';
      default:
        return issue.message;
    }
  });

  return uniqueClean(actions);
}
