# Demo Login Production Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Disable the fixed demo account login by default in production while preserving local development behavior.

**Architecture:** Keep the change inside the backend auth service so runtime behavior is enforced even if a frontend still renders the demo button. Inject `ConfigService` into `AuthService`, add a small `isDemoLoginEnabled()` helper, and reject disabled demo login before touching Prisma.

**Tech Stack:** NestJS, `@nestjs/config`, Jest, Prisma service mocks, pnpm.

---

## File Map

- Modify `packages/backend/src/auth/auth.service.ts`: inject `ConfigService` and gate `loginDemo()`.
- Modify `packages/backend/src/auth/auth.service.spec.ts`: add config mock and demo login tests.
- No UI files.
- No `packages/agent` files.

## Task 1: Demo Login Tests

**Files:**

- Modify: `packages/backend/src/auth/auth.service.spec.ts`

- [x] **Step 1: Add config mock support**

Update the test helper so it can pass `NODE_ENV` and `ENABLE_DEMO_LOGIN` into `AuthService`:

```ts
function createService(configValues: Record<string, string | undefined> = {}) {
  const configService = {
    get: jest.fn((key: string) => configValues[key]),
  };

  return {
    configService,
    service: new AuthService(
      jwtService as never,
      prisma as never,
      googleIdentity as never,
      configService as never,
    ),
  };
}
```

- [x] **Step 2: Add failing demo gate tests**

Add tests:

```ts
it('allows demo login outside production by default', async () => {
  const { prisma, service } = createService();
  prisma.user.upsert.mockResolvedValue({
    account: 'creator@rednote.local',
    authProvider: 'password',
    displayName: '内容创作者',
    googleSub: null,
    id: 'demo-user',
    passwordHash: 'argon-hash',
  });

  const result = await service.loginDemo();

  expect(prisma.user.upsert).toHaveBeenCalled();
  expect(result.user.account).toBe('creator@rednote.local');
});

it('rejects demo login in production by default', async () => {
  const { prisma, service } = createService({ NODE_ENV: 'production' });

  await expect(service.loginDemo()).rejects.toBeInstanceOf(UnauthorizedException);
  expect(prisma.user.upsert).not.toHaveBeenCalled();
});

it('allows demo login in production when explicitly enabled', async () => {
  const { prisma, service } = createService({
    ENABLE_DEMO_LOGIN: 'true',
    NODE_ENV: 'production',
  });
  prisma.user.upsert.mockResolvedValue({
    account: 'creator@rednote.local',
    authProvider: 'password',
    displayName: '内容创作者',
    googleSub: null,
    id: 'demo-user',
    passwordHash: 'argon-hash',
  });

  const result = await service.loginDemo();

  expect(prisma.user.upsert).toHaveBeenCalled();
  expect(result.user.account).toBe('creator@rednote.local');
});
```

- [x] **Step 3: Run RED**

Run:

```bash
pnpm --filter @rednote/backend test -- auth.service.spec.ts
```

Expected: FAIL because `AuthService` does not accept the config dependency or does not gate production demo login yet.

## Task 2: Demo Login Gate Implementation

**Files:**

- Modify: `packages/backend/src/auth/auth.service.ts`

- [x] **Step 1: Inject config service**

Add:

```ts
import { ConfigService } from '@nestjs/config';
```

Extend the constructor:

```ts
constructor(
  private readonly jwtService: JwtService,
  private readonly prisma: PrismaService,
  private readonly googleIdentityService: GoogleIdentityService,
  private readonly configService: ConfigService,
) {}
```

- [x] **Step 2: Gate demo login before Prisma writes**

Add this check at the start of `loginDemo()`:

```ts
if (!this.isDemoLoginEnabled()) {
  throw new UnauthorizedException('Demo login is disabled.');
}
```

Add helper:

```ts
private isDemoLoginEnabled(): boolean {
  const nodeEnv = this.configService.get<string>('NODE_ENV')?.trim();
  const explicitFlag = this.configService
    .get<string>('ENABLE_DEMO_LOGIN')
    ?.trim()
    .toLowerCase();

  return nodeEnv !== 'production' || explicitFlag === 'true';
}
```

- [x] **Step 3: Run GREEN**

Run:

```bash
pnpm --filter @rednote/backend test -- auth.service.spec.ts
```

Expected: PASS.

## Task 3: Verification And Commit

- [x] Run `pnpm --filter @rednote/backend exec prettier --write src/auth/auth.service.ts src/auth/auth.service.spec.ts`.
- [x] Run `pnpm --filter @rednote/backend test -- auth.service.spec.ts`.
- [x] Run `pnpm -r --if-present test`.
- [x] Run `pnpm -r --if-present build`.
- [x] Run `git diff --check`.

Commit and push are performed by the outer workflow after this checklist is verified.
