import { Body, Controller, HttpStatus, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { readUserSessionToken } from "../auth/auth-session.js";
import { UserSessionService } from "../auth/user-session.service.js";
import { encodeStreamEvent } from "./agent-event-normalizer.js";
import { AgentService } from "./agent.service.js";
import { parseAgentChatRequest } from "./agent.types.js";
import { ModelConfigurationError } from "./model-factory.js";

@Controller("agent")
export class AgentController {
  constructor(
    private readonly agentService: AgentService,
    private readonly sessions: UserSessionService
  ) {}

  @Post("chat")
  async chat(
    @Req() request: Request,
    @Body() body: unknown,
    @Res() response: Response
  ) {
    await this.sessions.requireUser(readUserSessionToken(request.headers.cookie));

    const parsed = parseAgentChatRequest(body);

    if (!parsed) {
      return response
        .status(HttpStatus.BAD_REQUEST)
        .json({ message: "Invalid agent chat request." });
    }

    try {
      const stream = this.agentService.streamChat(parsed);
      const first = await stream.next();

      response.status(HttpStatus.OK);
      response.setHeader("Cache-Control", "no-cache, no-transform");
      response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");

      if (!first.done) {
        response.write(encodeStreamEvent(first.value));
      }

      for await (const event of stream) {
        response.write(encodeStreamEvent(event));
      }

      response.end();
    } catch (error) {
      if (error instanceof ModelConfigurationError && !response.headersSent) {
        return response
          .status(HttpStatus.SERVICE_UNAVAILABLE)
          .json({ message: error.message });
      }

      const message = error instanceof Error ? error.message : String(error);

      if (!response.headersSent) {
        return response.status(HttpStatus.BAD_REQUEST).json({ message });
      }

      response.write(encodeStreamEvent({ type: "error", message }));
      response.end();
    }
  }
}
