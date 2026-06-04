import type { LanguageModel, ModelMessage } from 'ai';
import { createMockModel } from '../mock';
import { ToolRegistry, type ToolDefinition } from '../tools';
import { agentLoop, type AgentLoopEvent } from './index';

const SYSTEM = 'test agent';

async function collectEvents(
  input: string,
  registry = new ToolRegistry(),
): Promise<AgentLoopEvent[]> {
  const messages: ModelMessage[] = [{ role: 'user', content: input }];
  const events: AgentLoopEvent[] = [];

  for await (const event of agentLoop({
    model: createMockModel() as unknown as LanguageModel,
    registry,
    messages,
    system: SYSTEM,
    maxSteps: 3,
  })) {
    events.push(event);
  }

  return events;
}

describe('agentLoop events', () => {
  it('yields text deltas as structured events', async () => {
    const events = await collectEvents('你好');

    expect(events[0]?.type).toBe('text-delta');
    if (events[0]?.type !== 'text-delta') {
      throw new Error('expected first event to be a text delta');
    }
    expect(events[0].text.length).toBeGreaterThan(0);
    expect(events.map((event) => event.type)).toContain('stop');
    expect(
      events
        .filter((event) => event.type === 'text-delta')
        .map((event) => event.text)
        .join(''),
    ).toContain('Super Agent');
  });

  it('yields tool call and tool result events', async () => {
    const registry = new ToolRegistry();
    const weatherTool: ToolDefinition = {
      name: 'get_weather',
      description: 'test weather tool',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string' },
        },
        required: ['city'],
        additionalProperties: false,
      },
      isConcurrencySafe: true,
      isReadOnly: true,
      execute: ({ city }: { city: string }) => Promise.resolve(`${city}: 晴`),
    };
    registry.register(weatherTool);

    const events = await collectEvents('北京天气怎么样', registry);

    expect(events).toEqual(
      expect.arrayContaining([
        {
          type: 'tool-call',
          toolName: 'get_weather',
          input: { city: '北京' },
        },
        {
          type: 'tool-result',
          toolName: 'get_weather',
          output: '北京: 晴',
          preview: '北京: 晴',
        },
      ]),
    );
  });
});
