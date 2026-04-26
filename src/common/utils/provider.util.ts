export function normalizeProviderKey(provider?: string | null): string {
  const normalized = String(provider ?? '').trim().toLowerCase();
  if (!normalized) return '';

  if (normalized === 'qianwen') return 'qwen';
  if (normalized === 'mj') return 'midjourney';
  if (normalized === 'wanxiang') return 'wanx';

  return normalized;
}

export function isQwenProvider(provider?: string | null): boolean {
  const normalized = normalizeProviderKey(provider);
  return normalized === 'qwen' || normalized.includes('qwen') || normalized.includes('qianwen');
}
