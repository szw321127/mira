import { BadRequestException } from '@nestjs/common';
import type { AiTextModelService } from '../model-provider/ai-text-model.service';
import { GenerationService } from './generation.service';
import type { OutlineForDraft } from './generation.types';

describe('GenerationService real text provider', () => {
  function createService() {
    const textModel = {
      generateTextJson: jest.fn(),
    } satisfies Partial<AiTextModelService>;

    return {
      service: new GenerationService(textModel as AiTextModelService),
      textModel,
    };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('generates exactly three outlines through the configured text model', async () => {
    const { service, textModel } = createService();
    textModel.generateTextJson.mockResolvedValueOnce({
      outlines: [
        {
          hook: '先让读者看到改造前后的差别。',
          label: '高收藏',
          points: ['预算', '材料', '步骤', '避坑', '复盘'],
          title: '出租屋阳台早餐角改造',
          tone: 'guide',
        },
        {
          hook: '从第一次坐下来吃早餐的画面切入。',
          label: '生活感',
          points: ['起因', '布置', '细节', '变化', '互动'],
          title: '把阳台变成早晨的小角落',
          tone: 'story',
        },
        {
          hook: '把所有选择整理成清单。',
          label: '快读',
          points: ['适合谁', '预算', '尺寸', '购买', '维护'],
          title: '阳台早餐角采购清单',
          tone: 'checklist',
        },
      ],
    });

    const outlines = await service.createOutlines('出租屋阳台早餐角', 2);

    expect(outlines).toHaveLength(3);
    expect(outlines[0]).toMatchObject({
      label: '高收藏',
      title: '出租屋阳台早餐角改造',
      tone: 'guide',
    });
    expect(textModel.generateTextJson).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.any(Array),
        temperature: 0.8,
      }),
    );
    const request = textModel.generateTextJson.mock.calls[0][0];
    expect(JSON.stringify(request.messages)).toContain('一次生成 3 个大纲');
    expect(JSON.stringify(request.messages)).toContain('第 3 批');
  });

  it('generates a publish-ready post draft through the configured text model', async () => {
    const { service, textModel } = createService();
    textModel.generateTextJson.mockResolvedValueOnce({
      caption: '把阳台早餐角做出来后，最明显的变化是早晨不再只剩赶时间。',
      coverLine: '阳台早餐角',
      imagePrompt:
        '竖版小红书封面，真实出租屋阳台，早餐盘，柔和自然光，标题留白。',
      sections: [
        '1. 预算：先定 300 元以内，避免越买越多。',
        '2. 尺寸：量好阳台宽度，桌面别挡动线。',
        '3. 采买：优先选可折叠和好清洁的单品。',
        '4. 布置：把杯子、餐盘和绿植集中在一侧。',
        '5. 复盘：拍完照后留下每天真的会用的东西。',
      ],
      tags: ['小红书家居', '出租屋改造', '早餐角'],
      title: '出租屋阳台早餐角，300 元内就能开始',
    });
    const outline: OutlineForDraft = {
      hook: '给读者一个能马上开始的理由。',
      id: 'outline-1',
      label: '高收藏',
      points: ['预算', '尺寸', '采买', '布置', '复盘'],
      title: '出租屋阳台早餐角改造',
      tone: 'guide',
    };

    const draft = await service.createPostDraft('出租屋阳台早餐角', outline);

    expect(draft.title).toBe('出租屋阳台早餐角，300 元内就能开始');
    expect(draft.coverLine).toBe('阳台早餐角');
    expect(draft.sections).toHaveLength(5);
    expect(draft.tags).toEqual(['小红书家居', '出租屋改造', '早餐角']);
    expect(draft.imagePrompt).toContain('标题留白');
    const promptText = JSON.stringify(
      textModel.generateTextJson.mock.calls[0][0].messages,
    );

    expect(promptText).toContain('最终可以直接发布');
    expect(promptText).toContain('sections 必须是正文段落');
    expect(promptText).toContain('不要返回大纲要点');
  });

  it('rejects malformed provider JSON instead of falling back to templates', async () => {
    const { service, textModel } = createService();
    textModel.generateTextJson.mockResolvedValueOnce({ outlines: 'bad' });

    await expect(service.createOutlines('出租屋阳台早餐角', 0)).rejects.toThrow(
      BadRequestException,
    );
  });
});
