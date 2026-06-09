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
});
