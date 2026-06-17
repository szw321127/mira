import { createGPTHarness } from './generator';
import { AgentLoopEvent } from './loop';

describe('createGPTHarness', () => {
  it('streams only text deltas from runText while keeping user input in messages', async () => {
    const events: AgentLoopEvent[] = [
      { type: 'text-delta', text: 'hello' },
      { type: 'tool-call', toolName: 'search', input: { q: 'x' } },
      { type: 'text-delta', text: ' world' },
      { type: 'stop', reason: 'done' },
    ];

    const harness = createGPTHarness({
      model: {} as never,
      runLoop: async function* () {
        yield* events;
      },
    });

    const chunks: string[] = [];
    for await (const chunk of harness.runText('hi')) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['hello', ' world']);
    expect(harness.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });
});
