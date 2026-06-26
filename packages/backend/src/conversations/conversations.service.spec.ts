import { NotFoundException } from "@nestjs/common";
import { jest } from "@jest/globals";
import type { PrismaService } from "../database/prisma.service.js";
import { ConversationsService } from "./conversations.service.js";
import type { PersistedChatMessage } from "./conversations.types.js";

type ConversationRow = {
  id: string;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  messages: MessageRow[];
};

type MessageRow = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  attachments: unknown;
  status: "complete" | "streaming" | "stopped" | "error" | null;
  events: unknown;
  createdAt: Date;
};

function createPrisma(conversations: ConversationRow[]) {
  const conversationUpdateMany = jest.fn(({ where, data }: Record<string, unknown>) => {
    const typedWhere = where as { id: string; userId: string; deletedAt: null };
    let count = 0;
    for (const conversation of conversations) {
      if (
        conversation.id === typedWhere.id &&
        conversation.userId === typedWhere.userId &&
        conversation.deletedAt === typedWhere.deletedAt
      ) {
        Object.assign(conversation, data);
        count += 1;
      }
    }
    return Promise.resolve({ count });
  });

  const prisma = {
    conversation: {
      findMany: jest.fn(({ where, orderBy, include }: Record<string, unknown>) => {
        const rows = conversations
          .filter((conversation) => {
            const typedWhere = where as { userId: string; deletedAt: null };
            return (
              conversation.userId === typedWhere.userId &&
              conversation.deletedAt === typedWhere.deletedAt
            );
          })
          .sort((left, right) => {
            const typedOrderBy = orderBy as { updatedAt: "desc" };
            if (typedOrderBy.updatedAt !== "desc") return 0;
            return right.updatedAt.getTime() - left.updatedAt.getTime();
          })
          .map((conversation) => ({
            ...conversation,
            messages: include
              ? [...conversation.messages].sort((left, right) => {
                  return left.createdAt.getTime() - right.createdAt.getTime();
                })
              : []
          }));

        return Promise.resolve(rows);
      }),
      findFirst: jest.fn(({ where }: { where: { id: string; userId: string; deletedAt: null } }) => {
        return Promise.resolve(
          conversations.find((conversation) => {
            return (
              conversation.id === where.id &&
              conversation.userId === where.userId &&
              conversation.deletedAt === where.deletedAt
            );
          }) ?? null
        );
      }),
      updateMany: conversationUpdateMany,
      update: jest.fn(({ where, data }: Record<string, unknown>) => {
        const typedWhere = where as { id: string };
        const conversation = conversations.find((row) => row.id === typedWhere.id);
        if (!conversation) throw new Error("Conversation not found");
        Object.assign(conversation, data);
        return Promise.resolve(conversation);
      }),
      create: jest.fn(({ data }: Record<string, unknown>) => {
        const typedData = data as { userId: string; title: string };
        const now = new Date("2026-06-22T11:00:00.000Z");
        const conversation: ConversationRow = {
          id: `conversation-${conversations.length + 1}`,
          userId: typedData.userId,
          title: typedData.title,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          messages: []
        };
        conversations.push(conversation);
        return Promise.resolve(conversation);
      })
    },
    message: {
      findMany: jest.fn(({ where, orderBy }: Record<string, unknown>) => {
        const typedWhere = where as { conversationId: string };
        const rows =
          conversations.find((row) => row.id === typedWhere.conversationId)?.messages ?? [];
        return Promise.resolve(
          [...rows].sort((left, right) => {
            const typedOrderBy = orderBy as { createdAt: "asc" } | undefined;
            if (typedOrderBy?.createdAt !== "asc") return 0;
            return left.createdAt.getTime() - right.createdAt.getTime();
          })
        );
      }),
      deleteMany: jest.fn(({ where }: { where: { conversationId: string } }) => {
        const conversation = conversations.find((row) => row.id === where.conversationId);
        if (conversation) conversation.messages = [];
        return Promise.resolve({ count: 1 });
      }),
      createMany: jest.fn(({ data }: { data: MessageRow[] }) => {
        for (const message of data) {
          const conversation = conversations.find((row) => {
            return row.id === message.conversationId;
          });
          conversation?.messages.push(message);
        }
        return Promise.resolve({ count: data.length });
      })
    },
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      return callback(prisma);
    })
  };

  return Object.assign(prisma as unknown as PrismaService, {
    mocks: {
      conversationUpdateMany
    }
  });
}

describe("ConversationsService", () => {
  it("lists only non-deleted conversations for the current user with ordered serialized messages", async () => {
    const prisma = createPrisma([
      conversation("c-old", "user-1", "Old", "2026-06-22T09:00:00.000Z", [
        message("m2", "c-old", "assistant", "there", "2026-06-22T09:02:00.000Z", {
          status: null,
          events: null
        }),
        message("m1", "c-old", "user", "hi", "2026-06-22T09:01:00.000Z", {
          status: "complete",
          events: [{ type: "sent" }]
        })
      ]),
      conversation("c-deleted", "user-1", "Deleted", "2026-06-22T10:00:00.000Z", [], {
        deletedAt: new Date("2026-06-22T10:30:00.000Z")
      }),
      conversation("c-other", "user-2", "Other user", "2026-06-22T11:00:00.000Z", []),
      conversation("c-new", "user-1", "New", "2026-06-22T12:00:00.000Z", [])
    ]);
    const service = new ConversationsService(prisma);

    await expect(service.list("user-1")).resolves.toEqual({
      conversations: [
        {
          id: "c-new",
          title: "New",
          createdAt: "2026-06-22T12:00:00.000Z",
          updatedAt: "2026-06-22T12:00:00.000Z",
          messages: []
        },
        {
          id: "c-old",
          title: "Old",
          createdAt: "2026-06-22T09:00:00.000Z",
          updatedAt: "2026-06-22T09:00:00.000Z",
          messages: [
            {
              id: "m1",
              role: "user",
              content: "hi",
              attachments: [],
              status: "complete",
              events: [{ type: "sent" }],
              createdAt: "2026-06-22T09:01:00.000Z"
            },
            {
              id: "m2",
              role: "assistant",
              content: "there",
              attachments: [],
              events: [],
              createdAt: "2026-06-22T09:02:00.000Z"
            }
          ]
        }
      ]
    });
  });

  it("rejects renaming another user's conversation with NotFoundException", async () => {
    const prisma = createPrisma([
      conversation("c-other", "user-2", "Other user", "2026-06-22T09:00:00.000Z", [])
    ]);
    const service = new ConversationsService(prisma);

    await expect(service.rename("user-1", "c-other", "Mine now")).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it("replaces messages for a user-owned conversation preserving message fields", async () => {
    const prisma = createPrisma([
      conversation("c-owned", "user-1", "Owned", "2026-06-22T09:00:00.000Z", [
        message("old-message", "c-owned", "user", "old", "2026-06-22T09:01:00.000Z")
      ])
    ]);
    const service = new ConversationsService(prisma);
    const replacement: PersistedChatMessage[] = [
      {
        id: "client-user-message",
        role: "user",
        content: "new prompt",
        attachments: [
          {
            id: "att-1",
            type: "image",
            name: "source.png",
            mimeType: "image/png",
            dataUrl: "data:image/png;base64,aGVsbG8=",
            sizeBytes: 5
          }
        ],
        status: "complete",
        events: [{ type: "submitted" }],
        createdAt: "2026-06-22T10:01:00.000Z"
      },
      {
        id: "client-assistant-message",
        role: "assistant",
        content: "new answer",
        attachments: [],
        status: "stopped",
        events: [{ type: "stop", reason: "manual" }],
        createdAt: "2026-06-22T10:02:00.000Z"
      }
    ];

    await expect(service.replaceMessages("user-1", "c-owned", replacement)).resolves.toEqual({
      ok: true
    });

    await expect(service.list("user-1")).resolves.toMatchObject({
      conversations: [
        {
          id: "c-owned",
          messages: replacement
        }
      ]
    });

    expect(prisma.mocks.conversationUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "c-owned",
        userId: "user-1",
        deletedAt: null
      },
      data: expect.objectContaining({
        updatedAt: expect.any(Date)
      })
    });
  });

  it("keeps a newer assistant message when a stale streaming snapshot arrives later", async () => {
    const prisma = createPrisma([
      conversation("c-owned", "user-1", "Owned", "2026-06-22T09:00:00.000Z", [
        message("client-user-message", "c-owned", "user", "prompt", "2026-06-22T10:01:00.000Z"),
        message("client-assistant-message", "c-owned", "assistant", "full answer", "2026-06-22T10:02:00.000Z", {
          status: "complete",
          events: [
            { type: "text-delta", text: "full" },
            { type: "text-delta", text: " answer" },
            { type: "stop", reason: "done" }
          ]
        })
      ])
    ]);
    const service = new ConversationsService(prisma);
    const staleSnapshot: PersistedChatMessage[] = [
      {
        id: "client-user-message",
        role: "user",
        content: "prompt",
        createdAt: "2026-06-22T10:01:00.000Z"
      },
      {
        id: "client-assistant-message",
        role: "assistant",
        content: "full",
        status: "streaming",
        events: [{ type: "text-delta", text: "full" }],
        createdAt: "2026-06-22T10:02:00.000Z"
      }
    ];

    await expect(service.replaceMessages("user-1", "c-owned", staleSnapshot)).resolves.toEqual({
      ok: true
    });

    await expect(service.list("user-1")).resolves.toMatchObject({
      conversations: [
        {
          id: "c-owned",
          messages: [
            staleSnapshot[0],
            {
              id: "client-assistant-message",
              role: "assistant",
              content: "full answer",
              status: "complete",
              events: [
                { type: "text-delta", text: "full" },
                { type: "text-delta", text: " answer" },
                { type: "stop", reason: "done" }
              ]
            }
          ]
        }
      ]
    });
  });
});

function conversation(
  id: string,
  userId: string,
  title: string,
  updatedAt: string,
  messages: MessageRow[],
  overrides: Partial<ConversationRow> = {}
): ConversationRow {
  return {
    id,
    userId,
    title,
    createdAt: new Date(updatedAt),
    updatedAt: new Date(updatedAt),
    deletedAt: null,
    messages,
    ...overrides
  };
}

function message(
  id: string,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  createdAt: string,
  overrides: Partial<MessageRow> = {}
): MessageRow {
  return {
    id,
    conversationId,
    role,
    content,
    attachments: [],
    status: "complete",
    events: [],
    createdAt: new Date(createdAt),
    ...overrides
  };
}
