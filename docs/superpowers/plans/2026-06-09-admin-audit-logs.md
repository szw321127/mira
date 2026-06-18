# Admin Audit Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add backend audit logs for successful admin model, project, and task operations without changing the admin UI.

**Architecture:** Add a small `AdminAuditLogsModule` that owns audit persistence, sanitization, and newest-first listing. Admin project and model config services inject it and record successful operations after writes or connection tests. The audit subsystem stores metadata as JSON text and never stores API keys, tokens, passwords, or secrets.

**Tech Stack:** NestJS, Prisma SQLite, Jest, TypeScript, existing global `{ code, data, msg }` response envelope.

---

## File Map

- Modify `packages/backend/prisma/schema.prisma`: add `AdminAuditLog`.
- Add `packages/backend/prisma/migrations/20260609062000_add_admin_audit_logs/migration.sql`: create audit table and indexes.
- Add `packages/backend/src/admin-audit-logs/admin-audit-logs.types.ts`: service input/output types.
- Add `packages/backend/src/admin-audit-logs/admin-audit-logs.service.ts`: record/list/sanitize audit logs.
- Add `packages/backend/src/admin-audit-logs/admin-audit-logs.service.spec.ts`: audit service tests.
- Add `packages/backend/src/admin-audit-logs/admin-audit-logs.controller.ts`: `GET /admin/audit-logs`.
- Add `packages/backend/src/admin-audit-logs/admin-audit-logs.module.ts`: module exports service.
- Modify `packages/backend/src/app.module.ts`: import audit module for read endpoint.
- Modify `packages/backend/src/admin-projects/admin-projects.module.ts`: import audit module.
- Modify `packages/backend/src/admin-projects/admin-projects.service.ts`: record audits for project/task writes.
- Modify `packages/backend/src/admin-projects/admin-projects.service.spec.ts`: assert audit calls.
- Modify `packages/backend/src/admin-model-configs/admin-model-configs.module.ts`: import audit module.
- Modify `packages/backend/src/admin-model-configs/admin-model-configs.service.ts`: record audits for save/test.
- Modify `packages/backend/src/admin-model-configs/admin-model-configs.service.spec.ts`: assert audit calls and redaction.
- Modify `packages/admin-frontend/src/api.ts`: add audit log types and `loadAdminAuditLogs()`.
- Modify `packages/admin-frontend/src/admin-design.test.mjs`: assert audit log API contract.

## Tasks

### Task 1: Audit Log Data Model

- [ ] **Step 1: Add the Prisma model**

Edit `packages/backend/prisma/schema.prisma` and append:

```prisma
model AdminAuditLog {
  id         String   @id @default(cuid())
  action     String
  targetType String
  targetKey  String
  actor      String
  metadata   String
  createdAt  DateTime @default(now())

  @@index([createdAt])
  @@index([targetType, targetKey, createdAt])
}
```

- [ ] **Step 2: Add the migration**

Create `packages/backend/prisma/migrations/20260609062000_add_admin_audit_logs/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "metadata" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetType_targetKey_createdAt_idx" ON "AdminAuditLog"("targetType", "targetKey", "createdAt");
```

- [ ] **Step 3: Format Prisma**

Run: `pnpm --filter @rednote/backend exec prisma format --schema prisma/schema.prisma`

Expected: schema formatted without errors.

### Task 2: Audit Log Service

- [ ] **Step 1: Write the failing service tests**

Create `packages/backend/src/admin-audit-logs/admin-audit-logs.service.spec.ts`:

```ts
import { AdminAuditLogsService } from './admin-audit-logs.service';

describe('AdminAuditLogsService', () => {
  function createService(rows: Array<Record<string, unknown>> = []) {
    const prisma = {
      adminAuditLog: {
        create: jest.fn(async ({ data }) => ({
          ...data,
          createdAt: new Date('2026-06-09T00:00:00.000Z'),
          id: 'audit-created',
        })),
        findMany: jest.fn(async () => rows),
      },
    };

    return {
      prisma,
      service: new AdminAuditLogsService(prisma as never),
    };
  }

  it('records sanitized metadata without secrets', async () => {
    const { prisma, service } = createService();

    await service.record({
      action: 'model_config.saved',
      metadata: {
        apiKey: 'sk-secret',
        nested: { token: 'secret-token', visible: 'ok' },
        modelName: 'text-model',
      },
      targetKey: 'text',
      targetType: 'model_config',
    });

    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'model_config.saved',
        actor: 'system',
        metadata: JSON.stringify({
          modelName: 'text-model',
          nested: { visible: 'ok' },
        }),
        targetKey: 'text',
        targetType: 'model_config',
      },
    });
  });

  it('lists newest audit rows and parses metadata', async () => {
    const { prisma, service } = createService([
      {
        action: 'project.created',
        actor: 'system',
        createdAt: new Date('2026-06-09T00:00:00.000Z'),
        id: 'audit-1',
        metadata: '{"name":"商业化后台"}',
        targetKey: 'commercial-admin',
        targetType: 'project',
      },
    ]);

    await expect(service.list(150)).resolves.toEqual([
      {
        action: 'project.created',
        actor: 'system',
        createdAt: '2026-06-09T00:00:00.000Z',
        id: 'audit-1',
        metadata: { name: '商业化后台' },
        targetKey: 'commercial-admin',
        targetType: 'project',
      },
    ]);
    expect(prisma.adminAuditLog.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify RED**

Run: `pnpm --filter @rednote/backend test -- admin-audit-logs.service.spec.ts`

Expected: FAIL because `AdminAuditLogsService` does not exist.

- [ ] **Step 3: Implement the service and types**

Create `packages/backend/src/admin-audit-logs/admin-audit-logs.types.ts`:

```ts
export type AdminAuditTargetType = 'model_config' | 'project' | 'task';

export type AdminAuditLogRecordInput = {
  action: string;
  actor?: string;
  metadata?: Record<string, unknown>;
  targetKey: string;
  targetType: AdminAuditTargetType;
};

export type AdminAuditLogView = {
  action: string;
  actor: string;
  createdAt: string;
  id: string;
  metadata: Record<string, unknown>;
  targetKey: string;
  targetType: string;
};
```

Create `packages/backend/src/admin-audit-logs/admin-audit-logs.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AdminAuditLogRecordInput,
  AdminAuditLogView,
} from './admin-audit-logs.types';

type StoredAuditLog = {
  action: string;
  actor: string;
  createdAt: Date;
  id: string;
  metadata: string;
  targetKey: string;
  targetType: string;
};

const redactedKeyPattern = /(apiKey|apiKeyEncrypted|password|secret|token)/i;

@Injectable()
export class AdminAuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AdminAuditLogRecordInput): Promise<void> {
    await this.prisma.adminAuditLog.create({
      data: {
        action: input.action,
        actor: input.actor?.trim() || 'system',
        metadata: JSON.stringify(this.sanitizeMetadata(input.metadata ?? {})),
        targetKey: input.targetKey,
        targetType: input.targetType,
      },
    });
  }

  async list(limit = 50): Promise<AdminAuditLogView[]> {
    const take = Math.max(1, Math.min(limit, 100));
    const rows = await this.prisma.adminAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take,
    });

    return rows.map((row) => this.toView(row));
  }

  private toView(row: StoredAuditLog): AdminAuditLogView {
    return {
      action: row.action,
      actor: row.actor,
      createdAt: row.createdAt.toISOString(),
      id: row.id,
      metadata: this.parseMetadata(row.metadata),
      targetKey: row.targetKey,
      targetType: row.targetType,
    };
  }

  private parseMetadata(value: string): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(value);

      if (this.isRecord(parsed)) {
        return parsed;
      }
    } catch {
      return {};
    }

    return {};
  }

  private sanitizeMetadata(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeMetadata(item));
    }

    if (!this.isRecord(value)) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !redactedKeyPattern.test(key))
        .map(([key, child]) => [key, this.sanitizeMetadata(child)]),
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
```

- [ ] **Step 4: Run the service test to verify GREEN**

Run: `pnpm --filter @rednote/backend test -- admin-audit-logs.service.spec.ts`

Expected: PASS.

### Task 3: Audit Log Module and Read API

- [ ] **Step 1: Add controller and module**

Create `packages/backend/src/admin-audit-logs/admin-audit-logs.controller.ts`:

```ts
import { Controller, Get, Query } from '@nestjs/common';
import { AdminAuditLogsService } from './admin-audit-logs.service';

@Controller('admin/audit-logs')
export class AdminAuditLogsController {
  constructor(private readonly auditLogs: AdminAuditLogsService) {}

  @Get()
  list(@Query('limit') limit?: string) {
    return this.auditLogs.list(limit ? Number(limit) : undefined);
  }
}
```

Create `packages/backend/src/admin-audit-logs/admin-audit-logs.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminAuditLogsController } from './admin-audit-logs.controller';
import { AdminAuditLogsService } from './admin-audit-logs.service';

@Module({
  controllers: [AdminAuditLogsController],
  exports: [AdminAuditLogsService],
  imports: [PrismaModule],
  providers: [AdminAuditLogsService],
})
export class AdminAuditLogsModule {}
```

- [ ] **Step 2: Import audit module**

Modify `packages/backend/src/app.module.ts`:

```ts
import { AdminAuditLogsModule } from './admin-audit-logs/admin-audit-logs.module';
```

Add `AdminAuditLogsModule` to `imports`.

Modify `packages/backend/src/admin-projects/admin-projects.module.ts` and `packages/backend/src/admin-model-configs/admin-model-configs.module.ts` to import `AdminAuditLogsModule`.

### Task 4: Project and Task Audit Writes

- [ ] **Step 1: Extend existing tests**

Modify `packages/backend/src/admin-projects/admin-projects.service.spec.ts` so `createService()` creates:

```ts
const auditLogs = {
  record: jest.fn(async () => undefined),
};
```

Construct service as:

```ts
service: new AdminProjectsService(prisma as never, auditLogs as never),
```

Return `auditLogs` from `createService()`.

Add assertions to existing create/update/delete tests:

```ts
expect(auditLogs.record).toHaveBeenCalledWith({
  action: 'project.created',
  metadata: expect.objectContaining({
    name: '商业化后台',
    owner: '阿遥',
    priority: 'P1',
    status: '进行中',
  }),
  targetKey: 'commercial-admin',
  targetType: 'project',
});
```

For task create:

```ts
expect(auditLogs.record).toHaveBeenCalledWith({
  action: 'task.created',
  metadata: expect.objectContaining({
    assignee: 'Mia',
    name: '补齐任务管理',
    projectKey: 'commercial-admin',
    status: '推进中',
  }),
  targetKey: 'admin-task-crud',
  targetType: 'task',
});
```

For task update:

```ts
expect(auditLogs.record).toHaveBeenCalledWith({
  action: 'task.updated',
  metadata: expect.objectContaining({
    assignee: 'Kevin',
    projectKey: 'commercial-admin',
    status: '验收中',
  }),
  targetKey: 'admin-task-crud',
  targetType: 'task',
});
```

For task delete:

```ts
expect(auditLogs.record).toHaveBeenCalledWith({
  action: 'task.deleted',
  metadata: {},
  targetKey: 'admin-task-crud',
  targetType: 'task',
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm --filter @rednote/backend test -- admin-projects.service.spec.ts`

Expected: FAIL because audit calls are missing.

- [ ] **Step 3: Implement audit writes**

Modify `packages/backend/src/admin-projects/admin-projects.service.ts` constructor:

```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly auditLogs: AdminAuditLogsService,
) {}
```

Import `AdminAuditLogsService`.

After `createProjectRecord()` succeeds, call `auditLogs.record()` with `project.created`.

After `adminTask.create()` succeeds, call `auditLogs.record()` with `task.created`.

After `adminTask.update()` succeeds, call `auditLogs.record()` with `task.updated`.

After `adminTask.delete()` succeeds, call `auditLogs.record()` with `task.deleted`.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm --filter @rednote/backend test -- admin-projects.service.spec.ts`

Expected: PASS.

### Task 5: Model Config Audit Writes

- [ ] **Step 1: Extend existing tests**

Modify `packages/backend/src/admin-model-configs/admin-model-configs.service.spec.ts` so `createService()` creates:

```ts
const auditLogs = {
  record: jest.fn(async () => undefined),
};
```

Construct service as:

```ts
service: new AdminModelConfigsService(
  prisma as never,
  configService as never,
  auditLogs as never,
),
```

Return `auditLogs` from `createService()`.

In the save test, assert:

```ts
expect(auditLogs.record).toHaveBeenCalledWith({
  action: 'model_config.saved',
  metadata: {
    apiKeyUpdated: true,
    baseUrl: 'https://api.openai.example/v1',
    hasApiKey: true,
    modelName: 'gpt-rednote',
  },
  targetKey: 'text',
  targetType: 'model_config',
});
```

In the connection test, assert:

```ts
expect(auditLogs.record).toHaveBeenCalledWith({
  action: 'model_config.connection_tested',
  metadata: {
    endpoint: 'https://text.example/v1/chat/completions',
    modelName: 'text-model',
  },
  targetKey: 'text',
  targetType: 'model_config',
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm --filter @rednote/backend test -- admin-model-configs.service.spec.ts`

Expected: FAIL because audit calls are missing.

- [ ] **Step 3: Implement audit writes**

Modify `packages/backend/src/admin-model-configs/admin-model-configs.service.ts` constructor:

```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly configService: ConfigService,
  private readonly auditLogs: AdminAuditLogsService,
) {}
```

Import `AdminAuditLogsService`.

After save upsert succeeds, call `auditLogs.record()` with `model_config.saved`.

After `testConnection()` succeeds, call `auditLogs.record()` with `model_config.connection_tested`.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm --filter @rednote/backend test -- admin-model-configs.service.spec.ts`

Expected: PASS.

### Task 6: Admin Frontend API Contract

- [ ] **Step 1: Add failing static test**

Modify `packages/admin-frontend/src/admin-design.test.mjs` with:

```js
test("admin frontend API exposes audit log loading", () => {
  const api = readSource("api.ts");

  assert.match(api, /AdminAuditLog/);
  assert.match(api, /loadAdminAuditLogs/);
  assert.match(api, /\/admin\/audit-logs/);
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm --filter @rednote/admin-frontend test`

Expected: FAIL because the API function is missing.

- [ ] **Step 3: Add API types and function**

Modify `packages/admin-frontend/src/api.ts`:

```ts
export type AdminAuditLog = {
  action: string;
  actor: string;
  createdAt: string;
  id: string;
  metadata: Record<string, unknown>;
  targetKey: string;
  targetType: string;
};

export function loadAdminAuditLogs(limit = 50) {
  return request<AdminAuditLog[]>(`/admin/audit-logs?limit=${limit}`);
}
```

- [ ] **Step 4: Run test to verify GREEN**

Run: `pnpm --filter @rednote/admin-frontend test`

Expected: PASS.

### Task 7: Verification and Commit

- [ ] Run `pnpm --filter @rednote/backend exec prettier --write "src/**/*.ts"`.
- [ ] Run `pnpm --filter @rednote/backend exec prisma format --schema prisma/schema.prisma`.
- [ ] Run `pnpm --filter @rednote/backend exec prettier --write ../admin-frontend/src/api.ts ../admin-frontend/src/admin-design.test.mjs`.
- [ ] Run `pnpm --filter @rednote/backend test -- admin-audit-logs.service.spec.ts admin-projects.service.spec.ts admin-model-configs.service.spec.ts`.
- [ ] Run `pnpm --filter @rednote/admin-frontend test`.
- [ ] Run `pnpm -r --if-present test`.
- [ ] Run `pnpm -r --if-present build`.
- [ ] Run `git diff --check`.
- [ ] Run `pnpm --filter @rednote/backend prisma:migrate:deploy`.
- [ ] Start backend with `pnpm --filter @rednote/backend start:dev`.
- [ ] Verify `GET http://localhost:3001/admin/audit-logs` returns `{ code, data, msg }`.
- [ ] Stop backend.
- [ ] Commit with `git commit -m "feat: add admin audit logs"`.
- [ ] Push `git push origin dev`.
