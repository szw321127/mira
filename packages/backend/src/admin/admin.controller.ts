import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Req,
  Res,
  UnauthorizedException
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AdminService } from "./admin.service.js";

const SESSION_COOKIE = "mira_admin_session";

@Controller("admin")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: unknown, @Res() response: Response) {
    const credentials = parseCredentials(body);
    if (!credentials) {
      return response
        .status(HttpStatus.BAD_REQUEST)
        .json({ message: "Invalid login request." });
    }

    const result = await this.adminService.login(
      credentials.username,
      credentials.password
    );

    response.cookie(SESSION_COOKIE, result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 1000 * 60 * 60 * 8
    });

    return response.json({ username: result.username });
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  logout(@Res() response: Response) {
    response.clearCookie(SESSION_COOKIE, { path: "/" });
    return response.json({ ok: true });
  }

  @Get("session")
  session(@Req() request: Request) {
    return this.requireSession(request);
  }

  @Get("secrets")
  async secrets(@Req() request: Request) {
    this.requireSession(request);
    return { secrets: await this.adminService.listSecrets() };
  }

  @Put("secrets")
  async updateSecrets(@Req() request: Request, @Body() body: unknown) {
    this.requireSession(request);
    const parsed = parseSecretUpdate(body);
    if (!parsed) {
      return { secrets: await this.adminService.listSecrets() };
    }
    return this.adminService.updateSecrets(parsed);
  }

  @Post("password")
  @HttpCode(HttpStatus.OK)
  async password(@Req() request: Request, @Body() body: unknown) {
    this.requireSession(request);
    const parsed = parsePasswordChange(body);
    if (!parsed) {
      return { message: "Invalid password change request." };
    }

    return this.adminService.changePassword(
      parsed.currentPassword,
      parsed.newPassword
    );
  }

  private requireSession(request: Request) {
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    try {
      return this.adminService.verifyToken(token);
    } catch {
      throw new UnauthorizedException("Admin session required.");
    }
  }
}

function parseCredentials(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (typeof body.username !== "string" || typeof body.password !== "string") {
    return null;
  }
  return { username: body.username, password: body.password };
}

function parsePasswordChange(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (
    typeof body.currentPassword !== "string" ||
    typeof body.newPassword !== "string"
  ) {
    return null;
  }
  return {
    currentPassword: body.currentPassword,
    newPassword: body.newPassword
  };
}

function parseSecretUpdate(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (!body.secrets || typeof body.secrets !== "object") return null;
  return body.secrets as Record<string, unknown>;
}

function readCookie(header: string | undefined, name: string) {
  if (!header) return undefined;
  const cookies = header.split(";").map((part) => part.trim());
  const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}
