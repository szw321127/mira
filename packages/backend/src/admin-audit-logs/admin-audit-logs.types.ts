export type AdminAuditTargetType =
  | 'content_provider'
  | 'model_config'
  | 'project'
  | 'task';

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
