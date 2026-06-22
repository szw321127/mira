import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res
} from "@nestjs/common";
import type { Request, Response } from "express";
import {
  clearUserSessionCookie,
  readUserSessionToken,
  setUserSessionCookie
} from "./auth-session.js";
import { AuthService } from "./auth.service.js";
import { parseCodeRequest, parseLoginRequest } from "./auth.types.js";
import { UserSessionService } from "./user-session.service.js";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessions: UserSessionService
  ) {}

  @Post("code")
  @HttpCode(HttpStatus.OK)
  requestCode(@Req() request: Request, @Body() body: unknown) {
    const parsed = parseCodeRequest(body);
    if (!parsed) {
      throw new BadRequestException("请输入有效邮箱");
    }

    return this.authService.requestCode(parsed.email, readRequestIp(request) ?? undefined);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: unknown, @Res() response: Response) {
    const parsed = parseLoginRequest(body);
    if (!parsed) {
      throw new BadRequestException("请输入有效邮箱和 6 位验证码");
    }

    const result = await this.authService.login(parsed.email, parsed.code);
    setUserSessionCookie(response, result.token);
    return response.json({ user: result.user });
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(@Req() request: Request, @Res() response: Response) {
    const token = readUserSessionToken(request.headers.cookie);
    try {
      if (token) {
        await this.sessions.revokeToken(token);
      }
    } finally {
      clearUserSessionCookie(response);
    }
    return response.json({ ok: true });
  }

  @Get("session")
  async session(@Req() request: Request) {
    const user = await this.sessions.requireUser(
      readUserSessionToken(request.headers.cookie)
    );
    return { user };
  }
}

export function readRequestIp(request: Request): string | null {
  if (process.env.TRUST_PROXY_HEADERS === "true") {
    const forwardedFor = request.headers["x-forwarded-for"];
    if (typeof forwardedFor === "string") {
      return forwardedFor.split(",")[0]?.trim() || null;
    }
  }

  return request.ip ?? null;
}
