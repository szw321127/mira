import { BadRequestException } from '@nestjs/common';
import { XhsConnectorClient } from './xhs-connector.client';

function createClient(configValues: Record<string, string | undefined> = {}) {
  const config = {
    get: jest.fn((key: string) => configValues[key]),
  };

  return {
    client: new XhsConnectorClient(config as never),
    config,
  };
}

describe('XhsConnectorClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('validates a user cookie through the configured connector', async () => {
    const { client } = createClient({
      XHS_CONNECTOR_API_KEY: 'connector-key',
      XHS_CONNECTOR_BASE_URL: 'http://localhost:8800',
    });
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            account: {
              avatar: 'https://example.com/avatar.jpg',
              nickname: '小红书作者',
              user_id: 'xhs-user-1',
            },
            valid: true,
          },
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 },
      ),
    );

    const result = await client.validateCookie({
      cookie: 'a1=abc; web_session=session;',
      userId: 'user-1',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8800/xhs/auth/validate',
      expect.objectContaining({
        body: JSON.stringify({
          cookie: 'a1=abc; web_session=session;',
          userId: 'user-1',
        }),
        headers: expect.objectContaining({
          Authorization: 'Bearer connector-key',
        }),
        method: 'POST',
      }),
    );
    expect(result.account?.nickname).toBe('小红书作者');
  });

  it('fails clearly when connector env is missing', async () => {
    const { client } = createClient();

    await expect(
      client.validateCookie({ cookie: 'a1=abc;', userId: 'user-1' }),
    ).rejects.toThrow(BadRequestException);
  });
});
