import { XhsAnalysisService } from './xhs-analysis.service';

const textModel = {
  generateTextJson: jest.fn(),
};

describe('XhsAnalysisService publish package repair', () => {
  let service: XhsAnalysisService;

  beforeEach(() => {
    jest.restoreAllMocks();
    textModel.generateTextJson.mockClear();
    service = new XhsAnalysisService(
      {} as never,
      {} as never,
      textModel as never,
      {} as never,
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
    textModel.generateTextJson.mockResolvedValueOnce({
      publishPackage: repairedPackage,
    });

    const result = await service.repairPublishPackage({
      idea: '给初入职场女生做低预算通勤穿搭',
      publishPackage: brokenPackage,
      repairActions: ['补足 4-7 页图文结构', '补齐图片提示词和标签'],
    });

    expect(textModel.generateTextJson).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.any(Array),
        temperature: 0.55,
      }),
    );
    expect(
      JSON.stringify(textModel.generateTextJson.mock.calls[0][0].messages),
    ).toContain('完整 JSON');
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
