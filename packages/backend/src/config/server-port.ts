const DEFAULT_PORT = 3001;

export function resolveServerPort(env: Partial<Record<string, string>> = process.env) {
  return Number(env.BACKEND_PORT ?? env.PORT ?? DEFAULT_PORT);
}
