const EAST_ASIAN_CHAR_RE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/;
const LIKELY_MOJIBAKE_RE = /[ÃÂâæåøðñç¤¥]/;

function cleanupFileName(name: string) {
  return name
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripPathPart(name: string) {
  const normalized = name.replace(/^utf-8''/i, '');
  const parts = normalized.split(/[/\\]+/);
  return parts[parts.length - 1] || normalized;
}

export function normalizeUploadedFileName(rawName: string | null | undefined) {
  const input = cleanupFileName(stripPathPart(String(rawName || '')));
  if (!input) return 'file';

  let decodedUri = input;
  if (/%[0-9a-fA-F]{2}/.test(decodedUri)) {
    try {
      decodedUri = decodeURIComponent(decodedUri);
    } catch {
      decodedUri = input;
    }
  }

  const normalizedInput = cleanupFileName(decodedUri);
  if (!normalizedInput) return 'file';
  if (EAST_ASIAN_CHAR_RE.test(normalizedInput)) return normalizedInput;

  const latin1Decoded = cleanupFileName(Buffer.from(normalizedInput, 'latin1').toString('utf8'));
  if (!latin1Decoded || latin1Decoded.includes('\uFFFD')) return normalizedInput;

  if (EAST_ASIAN_CHAR_RE.test(latin1Decoded)) return latin1Decoded;
  if (LIKELY_MOJIBAKE_RE.test(normalizedInput) && !LIKELY_MOJIBAKE_RE.test(latin1Decoded)) return latin1Decoded;

  return normalizedInput;
}
