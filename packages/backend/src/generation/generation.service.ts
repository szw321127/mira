import { Injectable } from '@nestjs/common';
import type {
  GeneratedOutline,
  GeneratedPostDraft,
  OutlineForDraft,
  OutlineTone,
} from './generation.types';

const DEFAULT_TOPIC = '周末在家低成本做一顿有仪式感的晚餐，适合发小红书';

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
    const points = outline.points.length
      ? outline.points
      : ['痛点场景', '准备清单', '操作步骤', '避坑提醒', '结尾互动'];

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
    return `这篇想写给刚开始做小红书图文的人：${topic}其实不用一开始就追求复杂，只要先把「${outline.hook}」讲清楚，再用${toneName}的节奏把方法拆开，读者就能马上知道该怎么照着做。`;
  }

  private createCoverLine(toneName: string, label: string): string {
    const coverLine = `${toneName} ${label}`;
    return coverLine.length > 18 ? coverLine.slice(0, 18) : coverLine;
  }

  private createPostTitle(topic: string, outlineTitle: string): string {
    const compactTopic = topic.length > 18 ? `${topic.slice(0, 18)}...` : topic;
    return `${outlineTitle.replace('：', ' | ')}｜${compactTopic}`;
  }

  private createSection(
    topic: string,
    point: string,
    index: number,
    tone: OutlineTone,
  ): string {
    const sectionNo = index + 1;
    const toneLead: Record<OutlineTone, string> = {
      checklist: '可以直接照着这一步检查',
      guide: '真正好执行的关键在这里',
      story: '这一段要写得像发生在今天',
    };
    const practicalTip = [
      `先把「${point}」放到第一屏附近，让读者一眼知道这篇和「${topic}」有关。`,
      `准备内容时不要堆概念，直接写出一个能照做的小动作，比如时间、材料、顺序或判断标准。`,
      `如果过程里有取舍，把原因说清楚，比单纯说“高级”“好看”更容易被收藏。`,
      `遇到容易失败的地方，提前写出替代方案，读者会觉得这篇笔记真的替自己想过。`,
      `结尾把行动收回来：提醒读者先保存，再选一个最轻的步骤今天就试。`,
    ];

    return `${sectionNo}. ${point}：${toneLead[tone]}。${practicalTip[index % practicalTip.length]}`;
  }

  private normalizeTopic(topic: string): string {
    return topic.trim() || DEFAULT_TOPIC;
  }
}
