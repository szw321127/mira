import { pickSearchTool } from './web-search';

describe('web search tool selection', () => {
  it('uses explicit Tavily config for web backend registration', () => {
    expect(pickSearchTool().name).toBe('web_search');
    expect(pickSearchTool({ tavilyApiKey: 'test-tavily-key' }).name).toBe(
      'web_search',
    );
  });

  it('keeps web_search available so missing credentials produce setup guidance', () => {
    const tool = pickSearchTool({ tavilyApiKey: '' });

    expect(tool.name).toBe('web_search');
    return expect(tool.execute({ query: 'Mira' })).resolves.toContain(
      'Mira 后台 Key 配置',
    );
  });
});
