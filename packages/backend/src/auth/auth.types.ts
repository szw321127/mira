export type AuthenticatedUser = {
  account: string;
  id: string;
  name: string;
};

export type JwtPayload = {
  account: string;
  name: string;
  sub: string;
};
