export class MessageSaveQueue {
  constructor(saveRemoteMessages) {
    this.saveRemoteMessages = saveRemoteMessages;
    this.pending = new Map();
    this.inFlight = new Set();
  }

  queue(id, messages) {
    this.pending.set(id, messages);
    void this.flush(id);
  }

  async flush(id) {
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
