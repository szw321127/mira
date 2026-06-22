export type AuthUser = {
  id: string;
  email: string;
  status: "enabled" | "disabled";
};

export type AuthSession = {
  user: AuthUser;
};

export type AuthState =
  | { status: "checking" }
  | { status: "guest" }
  | { status: "ready"; user: AuthUser };
