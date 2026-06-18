type DatabaseEnv = Partial<Record<string, string>>;

export function resolveDatabaseUrl(env: DatabaseEnv = process.env) {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (env.DATABASE_TYPE !== "postgres") return undefined;

  const host = env.DATABASE_HOST;
  const database = env.DATABASE_NAME;
  const username = env.DATABASE_USER;
  const password = env.DATABASE_PASSWORD;

  if (!host || !database || !username || !password) return undefined;

  const port = env.DATABASE_PORT ?? "5432";
  const encodedUser = encodeURIComponent(username);
  const encodedPassword = encodeURIComponent(password);
  const encodedDatabase = encodeURIComponent(database);

  return `postgresql://${encodedUser}:${encodedPassword}@${host}:${port}/${encodedDatabase}?schema=public`;
}
