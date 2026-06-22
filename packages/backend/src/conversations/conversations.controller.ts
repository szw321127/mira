import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  Res
} from "@nestjs/common";
import type { Request, Response } from "express";
import { readUserSessionToken } from "../auth/auth-session.js";
import { UserSessionService } from "../auth/user-session.service.js";
import { ConversationsService } from "./conversations.service.js";
import {
  parseMessages,
  parseTitle,
  type PersistedChatMessage
} from "./conversations.types.js";

@Controller("conversations")
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly sessions: UserSessionService
  ) {}

  @Get()
  async list(@Req() request: Request) {
    const user = await this.requireUser(request);
    return this.conversations.list(user.id);
  }

  @Post()
  async create(@Req() request: Request, @Body() body: unknown) {
    const user = await this.requireUser(request);
    return this.conversations.create(user.id, parseTitle(body) ?? "新对话");
  }

  @Post("import")
  async import(
    @Req() request: Request,
    @Body() body: unknown,
    @Res() response: Response
  ) {
    const user = await this.requireUser(request);
    const conversations = parseImportConversations(body);
    if (!conversations) {
      return response
        .status(HttpStatus.BAD_REQUEST)
        .json({ message: "Invalid conversations." });
    }

    return response.json(
      await this.conversations.importConversations(user.id, conversations)
    );
  }

  @Patch(":id")
  async rename(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown,
    @Res() response: Response
  ) {
    const user = await this.requireUser(request);
    const title = parseTitle(body);
    if (!title) {
      return response
        .status(HttpStatus.BAD_REQUEST)
        .json({ message: "Invalid title." });
    }

    const result = await this.conversations.rename(user.id, id, title);
    return response.status(HttpStatus.OK).json(result);
  }

  @Delete(":id")
  async remove(@Req() request: Request, @Param("id") id: string) {
    const user = await this.requireUser(request);
    return this.conversations.remove(user.id, id);
  }

  @Post(":id/messages")
  async replaceMessages(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown,
    @Res() response: Response
  ) {
    const user = await this.requireUser(request);
    const messages = parseMessages(body);
    if (!messages) {
      return response
        .status(HttpStatus.BAD_REQUEST)
        .json({ message: "Invalid messages." });
    }

    const result = await this.conversations.replaceMessages(user.id, id, messages);
    return response.status(HttpStatus.CREATED).json(result);
  }

  private async requireUser(request: Request) {
    return this.sessions.requireUser(readUserSessionToken(request.headers.cookie));
  }
}

function parseImportConversations(
  body: unknown
): Array<{ title?: string; messages?: PersistedChatMessage[] }> | null {
  if (!body || typeof body !== "object") return null;

  const conversations = (body as { conversations?: unknown }).conversations;
  if (!Array.isArray(conversations)) return null;

  const parsed: Array<{ title?: string; messages?: PersistedChatMessage[] }> = [];

  for (const conversation of conversations) {
    if (!conversation || typeof conversation !== "object") return null;
    const raw = conversation as Record<string, unknown>;
    const title = parseTitle(conversation);
    const messages = parseMessages(conversation);

    if (raw.title === undefined && raw.messages === undefined) return null;
    if (raw.title !== undefined && !title) return null;
    if (raw.messages !== undefined && !messages) return null;
    if (!title && (!messages || messages.length === 0)) return null;

    parsed.push({
      ...(title ? { title } : {}),
      messages: messages ?? []
    });
  }

  return parsed;
}
