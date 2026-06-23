export type AuthUser = {
  id: string;
  email: string | null;
  username: string | null;
  status: "enabled" | "disabled";
};

export type AuthSession = {
  user: AuthUser;
};

export type AuthState =
  | { status: "checking" }
  | { status: "guest" }
  | { status: "ready"; user: AuthUser };
