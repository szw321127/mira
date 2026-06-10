import { XhsAnalysisService } from './xhs-analysis.service';

const modelConfigs = {
  getRuntimeConfig: jest.fn(() =>
    Promise.resolve({
      apiKey: 'text-provider-key',
      baseUrl: 'https://text-provider.example',
      modelName: 'rednote-text-model',
      type: 'text' as const,
    }),
  ),
};

describe('XhsAnalysisService publish package repair', () => {
  let service: XhsAnalysisService;

  beforeEach(() => {
    jest.restoreAllMocks();
    modelConfigs.getRuntimeConfig.mockClear();
    service = new XhsAnalysisService(
      {} as never,
      {} as never,
      modelConfigs as never,
    );
  });

  it('repairs an unready publish package through the text model and re-audits it', async () => {
    const workflow = service.buildCommercialWorkflow({
      idea: '给初入职场女生做低预算通勤穿搭',
      outline: [
        '通勤衣橱先控制颜色',
        '基础款要优先看版型',
        '用配饰做低成本变化',
        '购物前确认复穿率',
      ],
      pageCount: 5,
    });
    const brokenPackage = {
      ...workflow.publishPackage,
      hashtags: [],
      imagePromptPack: [],
      pages: workflow.publishPackage.pages.slice(0, 2),
    };
    const repairedPackage = {
      ...workflow.publishPackage,
      caption:
        '给刚入职的女生一套低预算通勤穿搭思路，先把颜色、版型和复穿率抓住，再用一件外套或配饰做变化。照着这套买，不容易闲置，也能覆盖早八、开会和周五放松场景。你会先补哪一件？评论区聊聊。',
      titleCandidates: ['低预算通勤穿搭这样买'],
    };
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({ publishPackage: repairedPackage }),
              },
            },
          ],
        }),
      ok: true,
    } as Response);

    const result = await service.repairPublishPackage({
      idea: '给初入职场女生做低预算通勤穿搭',
      publishPackage: brokenPackage,
      repairActions: ['补足 4-7 页图文结构', '补齐图片提示词和标签'],
    });

    expect(modelConfigs.getRuntimeConfig).toHaveBeenCalledWith('text');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://text-provider.example/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer text-provider-key',
        }) as HeadersInit,
        method: 'POST',
      }),
    );
    expect(result.repaired).toBe(true);
    expect(result.audit.ready).toBe(true);
    expect(result.publishPackage.titleCandidates[0]).toBe(
      '低预算通勤穿搭这样买',
    );
    expect(result.publishPackage.copyBlocks.title).toBe('低预算通勤穿搭这样买');
    expect(result.publishPackage.copyBlocks.caption).toBe(
      repairedPackage.caption,
    );
    expect(result.summary).toMatchObject({
      ready: true,
      score: result.audit.score,
    });
  });
});
