/**
 * Server-only settings. The read key never reaches the browser: pages fetch on the server
 * and send rendered HTML (ADR-0011).
 */
export interface DashboardConfig {
  apiUrl: string;
  readKey: string;
}

export interface BasicAuthCredentials {
  user: string;
  password: string;
}

export function loadDashboardConfig(env: NodeJS.ProcessEnv = process.env): DashboardConfig {
  return {
    apiUrl: required(env, 'AIUE_API_URL').replace(/\/+$/, ''),
    readKey: required(env, 'AIUE_READ_KEY'),
  };
}

/** Null when unset, so the proxy can refuse every request rather than run open. */
export function loadBasicAuthCredentials(
  env: NodeJS.ProcessEnv = process.env,
): BasicAuthCredentials | null {
  const user = env.DASHBOARD_USER;
  const password = env.DASHBOARD_PASSWORD;
  return user && password ? { user, password } : null;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
