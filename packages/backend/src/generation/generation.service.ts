import { Injectable } from '@nestjs/common';
import type {
  GeneratedOutline,
  GeneratedPostDraft,
  OutlineForDraft,
  OutlineTone,
} from './generation.types';

const DEFAULT_TOPIC = '周末在家低成本做一顿有仪式感的晚餐，适合发小红书';
const DEFAULT_DRAFT_POINTS = [
  '痛点场景',
  '准备清单',
  '操作步骤',
  '避坑提醒',
  '结尾互动',
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
      title: `${outline.title}：${normalizedTopic.slice(0, 18)}`,
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
    const normalizedTitle = outlineTitle.replace('：', ' | ');
    const topicStem = topic.slice(0, 18);
    const compactTopic = topic.length > 18 ? `${topic.slice(0, 18)}...` : topic;
    const titleAlreadyIncludesTopic =
      normalizedTitle.includes(topic) ||
      (topicStem.length > 0 && normalizedTitle.includes(topicStem));

    return titleAlreadyIncludesTopic
      ? normalizedTitle
      : `${normalizedTitle}｜${compactTopic}`;
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
    const toneLead: Record<OutlineTone, string> = {
      checklist: '这一项适合收藏后逐条核对',
      guide: '这一点可以马上用起来',
      story: '这一幕会很有生活感',
    };
    const sectionCopy = [
      `刚开始做「${topic}」时，最容易卡在不知道从哪里下手。把「${readerPoint}」当成起点，先处理眼前最具体的一件小事，整个过程会轻很多。`,
      `轮到「${readerPoint}」时，可以把时间、材料和顺序摆清楚：今天有什么、少什么、哪一步最省力。信息越具体，照做时越不容易慌。`,
      `如果「${readerPoint}」里需要取舍，就把标准落到日常：好不好清洗、会不会浪费、第二天还能不能继续用。这样不靠“高级”“好看”硬撑，也更适合收藏。`,
      `「${readerPoint}」最值得留意的是失败点。遇到来不及、材料不够或效果不稳的情况，换一个简单版本也可以完成，不会因为一步卡住就放弃。`,
      `最后回到「${readerPoint}」：保存这份顺序，今天只挑一个最轻的动作开始。做完再补一张照片或一句复盘，下一次会更顺手。`,
    ];

    return `${sectionNo}. ${readerPoint}：${toneLead[tone]}。${sectionCopy[index % sectionCopy.length]}`;
  }

  private createReaderPointLabel(point: string): string {
    const trimmedPoint = point.trim();
    const replacements: Array<[RegExp, string]> = [
      [/给读者的建议/g, '实用建议'],
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
