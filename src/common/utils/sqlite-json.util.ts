export function toSqliteJson(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function parseSqliteJson<T = unknown>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value as T;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return value as T;
  }
}

export function asSqliteJsonRecord(value: unknown): Record<string, unknown> | null {
  const parsed = parseSqliteJson(value);
  const candidate = parsed ?? value;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  return candidate as Record<string, unknown>;
}

export function asSqliteJsonArray<T = unknown>(value: unknown): T[] | null {
  const parsed = parseSqliteJson(value);
  const candidate = parsed ?? value;
  return Array.isArray(candidate) ? (candidate as T[]) : null;
}
