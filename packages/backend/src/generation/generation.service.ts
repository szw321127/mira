import { Injectable } from '@nestjs/common';
import type {
  GeneratedOutline,
  GeneratedPostDraft,
  OutlineForDraft,
  OutlineTone,
} from './generation.types';

const DEFAULT_TOPIC = '周末在家低成本做一顿有仪式感的晚餐，适合发小红书';
const DEFAULT_DRAFT_POINTS = [
  '先看省心理由',
  '准备好材料',
  '照着做步骤',
  '少踩坑做法',
  '保存后开做',
];

const toneMeta: Record<OutlineTone, { name: string; mark: string }> = {
  checklist: { name: '清单拆解', mark: '清单' },
  guide: { name: '实用攻略', mark: '攻略' },
  story: { name: '生活叙事', mark: '故事' },
};

const outlineBanks: GeneratedOutline[][] = [
  [
    {
      hook: '先给读者一个立刻想收藏的理由。',
      label: '高保存率',
      points: ['痛点场景', '准备清单', '操作步骤', '避坑提醒', '结尾互动'],
      title: '把一句灵感拆成可执行的 5 步',
      tone: 'guide',
    },
    {
      hook: '从一个小尴尬或小惊喜开始。',
      label: '强代入感',
      points: ['开场画面', '情绪铺垫', '关键选择', '结果反差', '温柔收束'],
      title: '用一天里的转折写出生活感',
      tone: 'story',
    },
    {
      hook: '把内容变成一张清楚的选择表。',
      label: '快读结构',
      points: ['适合谁', '不适合谁', '核心步骤', '替代方案', '保存提示'],
      title: '三类人群都能用的发布框架',
      tone: 'checklist',
    },
  ],
  [
    {
      hook: '先承认这件事没那么完美。',
      label: '更有人味',
      points: ['真实开头', '现场细节', '尝试过程', '关键发现', '给读者的建议'],
      title: '从真实困扰写到一个漂亮解法',
      tone: 'story',
    },
    {
      hook: '第一屏直接展示变化。',
      label: '更像教程',
      points: ['原始状态', '目标效果', '工具材料', '分步说明', '最终复盘'],
      title: '用前后对比做一篇干货图文',
      tone: 'guide',
    },
    {
      hook: '每一条都短到可以被记住。',
      label: '更易转发',
      points: ['必做三件事', '可选加分项', '预算控制', '时间安排', '失败补救'],
      title: '把经验整理成可截图的备忘录',
      tone: 'checklist',
    },
  ],
  [
    {
      hook: '用一句话定义这篇内容的收益。',
      label: '更利落',
      points: ['准备前', '进行中', '完成后', '常见问题', '评论引导'],
      title: '一页讲完准备、执行、复盘',
      tone: 'checklist',
    },
    {
      hook: '每一页只解决一个问题。',
      label: '更有节奏',
      points: ['封面钩子', '问题拆解', '方法展开', '例子证明', '行动清单'],
      title: '把普通主题做成连续翻页体验',
      tone: 'guide',
    },
    {
      hook: '让读者先看见人，再看见方法。',
      label: '更有温度',
      points: ['人物状态', '环境气味', '动作细节', '情绪变化', '余味结尾'],
      title: '用一个具体瞬间承载整篇笔记',
      tone: 'story',
    },
  ],
];

@Injectable()
export class GenerationService {
  createOutlines(topic: string, batchNo: number): GeneratedOutline[] {
    const source =
      outlineBanks[batchNo % outlineBanks.length] ?? outlineBanks[0];
    const normalizedTopic = this.normalizeTopic(topic);

    return source.map((outline) => ({
      ...outline,
      points: [...outline.points],
      title: `${outline.title}：${this.shortenTopic(normalizedTopic, 18)}`,
    }));
  }

  createPostDraft(topic: string, outline: OutlineForDraft): GeneratedPostDraft {
    const normalizedTopic = this.normalizeTopic(topic);
    const meta = toneMeta[outline.tone] ?? toneMeta.guide;
    const points = this.normalizeDraftPoints(outline.points);

    return {
      caption: this.createCaption(normalizedTopic, outline, meta.name),
      coverLine: this.createCoverLine(meta.name, outline.label),
      imagePrompt: `竖版小红书图文封面，主题为「${normalizedTopic}」，主标题使用「${this.createCoverLine(
        meta.name,
        outline.label,
      )}」，画面包含自然窗光、手写批注、红色贴纸和生活道具，标题区域留白清楚，整体干净、有真实创作感。`,
      sections: points.map((point, index) =>
        this.createSection(normalizedTopic, point, index, outline.tone),
      ),
      tags: ['小红书图文', meta.name, outline.label, '可直接发布'],
      title: this.createPostTitle(normalizedTopic, outline.title),
    };
  }

  private createCaption(
    topic: string,
    outline: OutlineForDraft,
    toneName: string,
  ): string {
    return `关于「${topic}」，这份${toneName}适合先收藏。把准备、步骤和容易踩坑的地方放在一条顺手流程里，照着做会比临时想办法更稳，也更容易做出${outline.label}的效果。`;
  }

  private createCoverLine(toneName: string, label: string): string {
    const coverLine = `${toneName} ${label}`;
    return coverLine.length > 18 ? coverLine.slice(0, 18) : coverLine;
  }

  private createPostTitle(topic: string, outlineTitle: string): string {
    const outlineBase = this.getOutlineTitleBase(outlineTitle);
    const normalizedTitle = outlineTitle.replace('：', ' | ');
    const topicHeadline = this.createTopicHeadline(topic);
    const topicStem = topic.slice(0, 18);
    const headlineStem = topicHeadline.slice(0, 8);
    const titleAlreadyIncludesTopic =
      normalizedTitle.includes(topic) ||
      (topicStem.length > 0 && normalizedTitle.includes(topicStem)) ||
      (headlineStem.length > 0 && normalizedTitle.includes(headlineStem));

    if (this.outlineTitleCarriesGeneratedTopic(outlineTitle, topic)) {
      return `${topicHeadline}｜${outlineBase}`;
    }

    return titleAlreadyIncludesTopic
      ? normalizedTitle
      : `${normalizedTitle}｜${this.shortenTopic(topic, 22)}`;
  }

  private normalizeDraftPoints(points: string[]): string[] {
    const providedPoints = points
      .map((point) => point.trim())
      .filter((point) => point.length > 0)
      .slice(0, DEFAULT_DRAFT_POINTS.length);

    return DEFAULT_DRAFT_POINTS.map(
      (fallbackPoint, index) => providedPoints[index] ?? fallbackPoint,
    );
  }

  private createSection(
    topic: string,
    point: string,
    index: number,
    tone: OutlineTone,
  ): string {
    const sectionNo = index + 1;
    const readerPoint = this.createReaderPointLabel(point);
    const toneLead: Record<OutlineTone, string[]> = {
      checklist: [
        '先判断自己适不适合',
        '照着准备会更省心',
        '执行时只看这几步',
        '遇到卡点就换轻量版',
        '保存后按顺序复用',
      ],
      guide: [
        '先把问题落到眼前',
        '准备阶段越具体越稳',
        '照做时抓住一个标准',
        '容易翻车的地方提前避开',
        '最后留一个轻动作',
      ],
      story: [
        '从一个真实瞬间进入',
        '把在意的原因写出来',
        '关键决定要有画面',
        '变化前后形成对照',
        '结尾留一点继续感',
      ],
    };
    const sectionCopy = [
      `刚开始做「${topic}」时，最容易卡在不知道从哪里下手。把「${readerPoint}」当成起点，先处理眼前最具体的一件小事，整个过程会轻很多。`,
      `轮到「${readerPoint}」时，可以把时间、材料和顺序摆清楚：今天有什么、少什么、哪一步最省力。信息越具体，照做时越不容易慌。`,
      `如果「${readerPoint}」里需要取舍，就把标准落到日常：好不好清洗、会不会浪费、第二天还能不能继续用。这样不靠“高级”“好看”硬撑，也更适合收藏。`,
      `「${readerPoint}」最值得留意的是失败点。遇到来不及、材料不够或效果不稳的情况，换一个简单版本也可以完成，不会因为一步卡住就放弃。`,
      `最后回到「${readerPoint}」：保存这份顺序，今天只挑一个最轻的动作开始。做完再补一张照片或一句复盘，下一次会更顺手。`,
    ];

    return `${sectionNo}. ${readerPoint}：${toneLead[tone][index % toneLead[tone].length]}。${sectionCopy[index % sectionCopy.length]}`;
  }

  private createTopicHeadline(topic: string): string {
    const cleanedTopic =
      topic
        .replace(/^小红书新手如何把/, '')
        .replace(/^小红书新手如何/, '')
        .replace(/^如何把/, '')
        .replace(/^如何/, '')
        .replace(/，适合发小红书$/, '')
        .trim() || topic;

    return this.shortenTopic(cleanedTopic, 24);
  }

  private getOutlineTitleBase(outlineTitle: string): string {
    return outlineTitle.split(/[：｜|]/)[0]?.trim() || outlineTitle.trim();
  }

  private outlineTitleCarriesGeneratedTopic(
    outlineTitle: string,
    topic: string,
  ): boolean {
    const [, suffix] = outlineTitle.split('：');

    if (!suffix) return false;

    const compactSuffix = suffix.trim().replace(/\.\.\.$/, '');

    return (
      suffix.includes('...') ||
      topic.startsWith(compactSuffix) ||
      this.shortenTopic(topic, 18).startsWith(compactSuffix)
    );
  }

  private shortenTopic(topic: string, maxLength: number): string {
    if (topic.length <= maxLength) return topic;

    return `${topic.slice(0, Math.max(1, maxLength - 3))}...`;
  }

  private createReaderPointLabel(point: string): string {
    const trimmedPoint = point.trim();
    const replacements: Array<[RegExp, string]> = [
      [/痛点场景/g, '先看省心理由'],
      [/准备清单/g, '准备好材料'],
      [/操作步骤/g, '照着做步骤'],
      [/避坑提醒/g, '少踩坑做法'],
      [/结尾互动/g, '保存后开做'],
      [/开场画面/g, '生活感开头'],
      [/情绪铺垫/g, '为什么会在意'],
      [/关键选择/g, '关键决定'],
      [/结果反差/g, '前后变化'],
      [/温柔收束/g, '保存后再试'],
      [/适合谁/g, '适合这样做的人'],
      [/不适合谁/g, '不建议这样做的情况'],
      [/核心步骤/g, '照着做步骤'],
      [/替代方案/g, '换个轻松做法'],
      [/保存提示/g, '收藏后这样用'],
      [/真实开头/g, '真实的一刻'],
      [/现场细节/g, '眼前的小细节'],
      [/尝试过程/g, '怎么试更顺'],
      [/关键发现/g, '发现省心方法'],
      [/给读者的建议/g, '实用建议'],
      [/原始状态/g, '改造前样子'],
      [/目标效果/g, '想要的效果'],
      [/工具材料/g, '要用到的东西'],
      [/分步说明/g, '一步步完成'],
      [/最终复盘/g, '做完后复盘'],
      [/必做三件事/g, '先做这三件事'],
      [/可选加分项/g, '有余力再加'],
      [/预算控制/g, '少花钱做法'],
      [/时间安排/g, '怎么安排时间'],
      [/失败补救/g, '不顺时这样补'],
      [/准备前/g, '开始前先看'],
      [/进行中/g, '做的时候注意'],
      [/完成后/g, '做完后整理'],
      [/常见问题/g, '常见卡点'],
      [/评论引导/g, '你的做法也可以'],
      [/封面钩子/g, '先看重点'],
      [/问题拆解/g, '问题在哪里'],
      [/方法展开/g, '方法怎么用'],
      [/例子证明/g, '这样做更直观'],
      [/行动清单/g, '今天先做几步'],
      [/人物状态/g, '真实状态'],
      [/环境气味/g, '当下氛围'],
      [/动作细节/g, '手边细节'],
      [/情绪变化/g, '感受变化'],
      [/余味结尾/g, '留一点余味'],
      [/给读者/g, '给你'],
      [/第一屏直接展示/g, '开头展示'],
      [/第一屏/g, '开头画面'],
      [/用一句话定义/g, '一句话看懂'],
      [/定义这篇内容/g, '看懂重点'],
      [/每一页只解决/g, '每页聚焦'],
      [/讲清楚/g, '说透'],
      [/拆开/g, '整理'],
      [/直接写出/g, '列出'],
      [/不要堆概念/g, '少绕弯'],
      [/结尾把行动收回来/g, '最后一步'],
      [/提醒读者/g, '记得'],
      [/写 2 到 3 句/g, '补充细节'],
      [/用定调的方式/g, '开头语气'],
      [/避免空泛形容/g, '说具体'],
    ];

    return replacements.reduce(
      (label, [pattern, replacement]) => label.replace(pattern, replacement),
      trimmedPoint,
    );
  }

  private normalizeTopic(topic: string): string {
    return topic.trim() || DEFAULT_TOPIC;
  }
}
