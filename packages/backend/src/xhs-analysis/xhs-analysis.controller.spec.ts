import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { XhsAnalysisController } from './xhs-analysis.controller';

describe('XhsAnalysisController', () => {
  it('exposes generation brief construction as a protected xhs-analysis endpoint', () => {
    const controller = new XhsAnalysisController({
      buildGenerationBrief: jest.fn(),
    } as never);
    const generationBriefHandler = Object.getOwnPropertyDescriptor(
      XhsAnalysisController.prototype,
      'buildGenerationBrief',
    )?.value as unknown;

    controller.buildGenerationBrief({
      idea: '给初入职场女生做低预算通勤穿搭',
      references: [],
    });

    expect(Reflect.getMetadata(PATH_METADATA, generationBriefHandler)).toBe(
      'generation-brief',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, generationBriefHandler)).toBe(
      RequestMethod.POST,
    );
  });

  it('passes the authenticated user when importing a post reference', () => {
    const service = {
      importAndAnalyzePost: jest.fn(),
    };
    const controller = new XhsAnalysisController(service as never);
    const dto = {
      conversationId: 'conversation-1',
      url: 'https://www.xiaohongshu.com/explore/note-42',
    };
    const user = {
      account: 'creator@rednote.local',
      id: 'user-1',
      name: '内容创作者',
    };

    void controller.importPost(user, dto);

    expect(service.importAndAnalyzePost).toHaveBeenCalledWith(dto, 'user-1');
  });

  it('exposes publish package repair as a protected xhs-analysis endpoint', () => {
    const controller = new XhsAnalysisController({
      repairPublishPackage: jest.fn(),
    } as never);
    const handler = Object.getOwnPropertyDescriptor(
      XhsAnalysisController.prototype,
      'repairPublishPackage',
    )?.value as unknown;

    void controller.repairPublishPackage({
      idea: '低预算通勤穿搭',
      publishPackage: {},
      repairActions: ['补齐分页'],
    });

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      'workflows/repair-publish-package',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
  });
});
