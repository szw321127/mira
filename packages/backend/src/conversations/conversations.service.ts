import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service.js";
import type { PersistedChatMessage } from "./conversations.types.js";

type ConversationWithMessages = {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages: MessageRecord[];
};

type MessageRecord = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments: unknown;
  status: "complete" | "streaming" | "stopped" | "error" | null;
  events: unknown;
  createdAt: Date;
};

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        userId,
        deletedAt: null
      },
      orderBy: {
        updatedAt: "desc"
      },
      include: {
        messages: {
          orderBy: {
            createdAt: "asc"
          }
        }
      }
    });

    return {
      conversations: conversations.map((conversation) => {
        return serializeConversation(conversation);
      })
    };
  }

  async create(userId: string, title = "新对话") {
    const conversation = await this.prisma.conversation.create({
      data: {
        userId,
        title
      },
      include: {
        messages: {
          orderBy: {
            createdAt: "asc"
          }
        }
      }
    });

    return {
      conversation: serializeConversation(conversation)
    };
  }

  async rename(userId: string, id: string, title: string) {
    const result = await this.prisma.conversation.updateMany({
      where: {
        id,
        userId,
        deletedAt: null
      },
      data: {
        title
      }
    });

    if (result.count === 0) throw new NotFoundException("Conversation not found.");
    return { ok: true };
  }

  async remove(userId: string, id: string) {
    const result = await this.prisma.conversation.updateMany({
      where: {
        id,
        userId,
        deletedAt: null
      },
      data: {
        deletedAt: new Date()
      }
    });

    if (result.count === 0) throw new NotFoundException("Conversation not found.");
    return { ok: true };
  }

  async replaceMessages(
    userId: string,
    id: string,
    messages: PersistedChatMessage[]
  ) {
    await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.updateMany({
        where: {
          id,
          userId,
          deletedAt: null
        },
        data: {
          updatedAt: new Date()
        }
      });

      if (conversation.count === 0) {
        throw new NotFoundException("Conversation not found.");
      }

      await tx.message.deleteMany({
        where: {
          conversationId: id
        }
      });

      if (messages.length > 0) {
        await tx.message.createMany({
          data: messages.map((message) => {
            return {
              ...(message.id ? { id: message.id } : {}),
              conversationId: id,
              role: message.role,
              content: message.content,
              attachments: toJsonAttachments(message.attachments),
              ...(message.status ? { status: message.status } : {}),
              events: toJsonEvents(message.events),
              ...(message.createdAt ? { createdAt: new Date(message.createdAt) } : {})
            };
          })
        });
      }

    });

    return { ok: true };
  }

  async importConversations(
    userId: string,
    conversations: Array<{ title?: string; messages?: PersistedChatMessage[] }>
  ) {
    for (const conversation of conversations) {
      const created = await this.prisma.conversation.create({
        data: {
          userId,
          title: conversation.title?.trim() || "新对话"
        }
      });

      const messages = Array.isArray(conversation.messages)
        ? conversation.messages
        : [];
      if (messages.length > 0) {
        await this.prisma.message.createMany({
          data: messages.map((message) => {
            return {
              ...(message.id ? { id: message.id } : {}),
              conversationId: created.id,
              role: message.role,
              content: message.content,
              attachments: toJsonAttachments(message.attachments),
              ...(message.status ? { status: message.status } : {}),
              events: toJsonEvents(message.events),
              ...(message.createdAt ? { createdAt: new Date(message.createdAt) } : {})
            };
          })
        });
      }
    }

    return this.list(userId);
  }
}

function serializeConversation(conversation: ConversationWithMessages) {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    messages: conversation.messages.map(serializeMessage)
  };
}

function serializeMessage(message: MessageRecord): PersistedChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    attachments: Array.isArray(message.attachments) ? message.attachments : [],
    ...(message.status ? { status: message.status } : {}),
    events: Array.isArray(message.events) ? message.events : [],
    createdAt: message.createdAt.toISOString()
  };
}

function toJsonEvents(events: unknown): Prisma.InputJsonValue {
  return (Array.isArray(events) ? events : []) as Prisma.InputJsonValue;
}

function toJsonAttachments(attachments: unknown): Prisma.InputJsonValue {
  return (Array.isArray(attachments) ? attachments : []) as Prisma.InputJsonValue;
}
