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
    const firstPoint = outline.points[0] ?? '核心场景';
    const secondPoint = outline.points[1] ?? '执行步骤';
    const meta = toneMeta[outline.tone] ?? toneMeta.guide;

    return {
      caption: `今天这篇围绕「${normalizedTopic}」展开，用「${firstPoint}」先把读者带进来，再用「${secondPoint}」给出清楚路径。整体语气保持自然、具体、可收藏。`,
      coverLine: `${meta.name} / ${outline.label}`,
      imagePrompt: `竖版图文封面，主题为「${normalizedTopic}」，画面有手写批注、红色贴纸、生活道具、自然窗光，标题区域留白清楚。`,
      sections: outline.points.map((point, index) => {
        const verbs = ['定调', '展开', '证明', '补充', '收束'];
        return `${index + 1}. ${point}：用${verbs[index] ?? '说明'}的方式写 2 到 3 句，避免空泛形容。`;
      }),
      tags: ['小红书图文', meta.name, outline.label, '可编辑大纲'],
      title: outline.title.replace('：', ' | '),
    };
  }

  private normalizeTopic(topic: string): string {
    return topic.trim() || DEFAULT_TOPIC;
  }
}
