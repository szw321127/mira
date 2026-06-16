export type XhsAuthorizationStatus =
  | 'active'
  | 'deleted'
  | 'expired'
  | 'invalid';

export type XhsAuthorizationView = {
  accountId: string | null;
  accountName: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  id: string;
  lastValidatedAt: Date | null;
  platform: 'xhs';
  status: XhsAuthorizationStatus;
  subType: 'pc';
  updatedAt: Date;
};

export type XhsAuthorizationRuntime = XhsAuthorizationView & {
  cookie: string;
};

export type XhsConnectorAccount = {
  avatar?: string | null;
  user_id?: string | null;
  nickname?: string | null;
};

export type XhsConnectorPost = Record<string, unknown>;
