import { jest } from "@jest/globals";
import { AgentService } from "./agent.service.js";

describe("AgentService", () => {
  it("uses the last non-empty user message and keeps previous messages as history", async () => {
    const runEvents = jest.fn(async function* (content: string) {
      await Promise.resolve();
      yield { type: "text-delta", text: content };
    });
    const createHarness = jest.fn(() => ({ runEvents }));
    const createModel = jest.fn(() => "model");
    const createRegistry = jest.fn(() => "registry");
    const service = new AgentService({
      createModel,
      createRegistry,
      createHarness
    });

    const events = [];
    for await (const event of service.streamChat({
      conversationId: "conversation-1",
      messages: [
        { role: "user", content: "第一条" },
        { role: "assistant", content: "回复" },
        { role: "user", content: "  最新问题  " }
      ]
    })) {
      events.push(event);
    }

    expect(createHarness).toHaveBeenCalledWith({
      model: "model",
      registry: "registry",
      messages: [
        { role: "user", content: "第一条" },
        { role: "assistant", content: "回复" }
      ],
      sessionId: "conversation-1",
      maxSteps: 8
    });
    expect(runEvents).toHaveBeenCalledWith("  最新问题  ");
    expect(events).toEqual([{ type: "text-delta", text: "  最新问题  " }]);
  });
});
