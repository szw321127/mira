import { fetchUrlTool } from './fetch-tools';

describe('fetchUrlTool', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('rejects non-http URLs before fetching', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    await expect(
      fetchUrlTool.execute({ url: 'file:///etc/passwd' }),
    ).resolves.toContain('只支持 http:// 或 https:// URL');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects localhost URLs before fetching', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    await expect(
      fetchUrlTool.execute({ url: 'http://127.0.0.1:3000/admin' }),
    ).resolves.toContain('不允许访问内网或本机地址');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects redirects to local network URLs', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: 'http://localhost/admin' },
        }),
      ),
    );

    await expect(
      fetchUrlTool.execute({ url: 'https://example.com/redirect' }),
    ).resolves.toContain('不允许访问内网或本机地址');
  });
});
