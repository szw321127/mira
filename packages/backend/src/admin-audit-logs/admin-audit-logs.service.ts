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
