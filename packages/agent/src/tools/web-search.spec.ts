import { pickSearchTool } from './web-search';

describe('web search tool selection', () => {
  const originalTavilyApiKey = process.env.TAVILY_API_KEY;
  const originalSerperApiKey = process.env.SERPER_API_KEY;

  afterEach(() => {
    process.env.TAVILY_API_KEY = originalTavilyApiKey;
    process.env.SERPER_API_KEY = originalSerperApiKey;
  });

  it('uses Tavily web_search when TAVILY_API_KEY is configured', () => {
    process.env.TAVILY_API_KEY = 'test-tavily-key';
    delete process.env.SERPER_API_KEY;

    expect(pickSearchTool().name).toBe('web_search');
  });

  it('keeps web_search available so missing credentials produce setup guidance', () => {
    delete process.env.TAVILY_API_KEY;
    delete process.env.SERPER_API_KEY;

    expect(pickSearchTool().name).toBe('web_search');
  });
});
