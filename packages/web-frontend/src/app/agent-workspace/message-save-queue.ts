import type { ChatMessage } from "./types";

type SaveRemoteMessages = (id: string, messages: ChatMessage[]) => Promise<void>;

export class MessageSaveQueue {
  private readonly pending = new Map<string, ChatMessage[]>();
  private readonly inFlight = new Set<string>();

  constructor(private readonly saveRemoteMessages: SaveRemoteMessages) {}

  queue(id: string, messages: ChatMessage[]) {
    this.pending.set(id, messages);
    void this.flush(id);
  }

  private async flush(id: string) {
    if (this.inFlight.has(id)) return;
    this.inFlight.add(id);

    try {
      while (this.pending.has(id)) {
        const messages = this.pending.get(id);
        this.pending.delete(id);
        if (!messages) continue;
        await this.saveRemoteMessages(id, messages);
      }
    } finally {
      this.inFlight.delete(id);
    }
  }
}
