import type { Request } from 'express';

export type AdminProfile = {
  account: string;
  createdAt: string;
  displayName: string;
  id: string;
  lastLoginAt: string | null;
  updatedAt: string;
};

export type AdminAuthResponse = {
  accessToken: string;
  admin: AdminProfile;
};

export type AuthenticatedAdmin = {
  account: string;
  displayName: string;
  id: string;
};

export type AdminJwtPayload = {
  account: string;
  displayName: string;
  scope: 'admin';
  sub: string;
};

export type AdminAuthenticatedRequest = Request & {
  admin?: AuthenticatedAdmin;
};
