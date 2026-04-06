export function normalizeForFingerprint(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim().replace(/\s+/g, ' ');
}

function fallbackFingerprint(text: string): string {
  let accA = 0x811c9dc5;
  let accB = 0x01000193;

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    accA ^= code;
    accA = Math.imul(accA, 0x01000193);
    accB ^= code + index;
    accB = Math.imul(accB, 0x27d4eb2d);
  }

  const parts = [
    accA >>> 0,
    accB >>> 0,
    (accA ^ accB) >>> 0,
    (accA + accB) >>> 0,
  ];
  return parts
    .map((part) => part.toString(16).padStart(8, '0'))
    .join('')
    .repeat(2);
}

function tokenCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of normalizeForFingerprint(text)
    .split(' ')
    .filter(Boolean)) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

export async function fingerprintText(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(normalizeForFingerprint(text));
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return fallbackFingerprint(normalizeForFingerprint(text));
  }
  const digest = await subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export function calculateChangeRatio(before: string, after: string): number {
  const normalizedBefore = normalizeForFingerprint(before);
  const normalizedAfter = normalizeForFingerprint(after);
  if (normalizedBefore === normalizedAfter) {
    return 0;
  }

  const beforeCounts = tokenCounts(normalizedBefore);
  const afterCounts = tokenCounts(normalizedAfter);
  let shared = 0;
  for (const [token, count] of beforeCounts.entries()) {
    shared += Math.min(count, afterCounts.get(token) ?? 0);
  }

  const beforeTotal = Array.from(beforeCounts.values()).reduce(
    (total, value) => total + value,
    0,
  );
  const afterTotal = Array.from(afterCounts.values()).reduce(
    (total, value) => total + value,
    0,
  );
  const maxTokens = Math.max(beforeTotal, afterTotal, 1);
  const tokenRatio = 1 - shared / maxTokens;
  const lengthRatio =
    Math.abs(normalizedBefore.length - normalizedAfter.length) /
    Math.max(normalizedBefore.length, normalizedAfter.length, 1);

  return Math.max(tokenRatio, lengthRatio);
}

export function hasSignificantChange(
  before: string,
  after: string,
  threshold = 0.18,
): boolean {
  return calculateChangeRatio(before, after) > threshold;
}
