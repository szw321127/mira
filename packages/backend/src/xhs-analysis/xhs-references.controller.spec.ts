import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { XhsReferencesController } from './xhs-references.controller';

describe('XhsReferencesController', () => {
  it('exposes a protected conversation-scoped xhs reference list route', () => {
    const controller = new XhsReferencesController({
      listReferences: jest.fn(),
    } as never);
    const handler = Object.getOwnPropertyDescriptor(
      XhsReferencesController.prototype,
      'list',
    )?.value as unknown;
    const user = {
      account: 'creator@rednote.local',
      id: 'user-1',
      name: '内容创作者',
    };

    void controller.list(user, 'conversation-1');

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      'conversations/:conversationId/xhs-references',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.GET,
    );
  });
});
