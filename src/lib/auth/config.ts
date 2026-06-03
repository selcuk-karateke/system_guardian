export function getAuthSecret(): string | null {
  const s = process.env.AUTH_SECRET?.trim();
  return s || null;
}

/** user → password */
export function getAuthUsers(): Map<string, string> {
  const users = new Map<string, string>();

  const multi = process.env.AUTH_USERS?.trim();
  if (multi) {
    for (const part of multi.split(",")) {
      const idx = part.indexOf(":");
      if (idx <= 0) continue;
      const user = part.slice(0, idx).trim();
      const pass = part.slice(idx + 1).trim();
      if (user && pass) users.set(user, pass);
    }
  }

  const user = process.env.AUTH_USERNAME?.trim();
  const pass = process.env.AUTH_PASSWORD?.trim();
  if (user && pass) users.set(user, pass);

  return users;
}

export function isAuthEnabled(): boolean {
  return !!getAuthSecret() && getAuthUsers().size > 0;
}

export function verifyCredentials(
  username: string,
  password: string,
): boolean {
  const expected = getAuthUsers().get(username.trim());
  return expected != null && expected === password;
}

export function getApiSecret(): string | null {
  const s = process.env.API_SECRET?.trim();
  return s || null;
}

export function isApiEnabled(): boolean {
  return !!getApiSecret();
}
