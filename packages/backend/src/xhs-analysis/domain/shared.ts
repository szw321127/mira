import type { XhsMetricValue } from './types';

const COUNT_UNIT_PATTERN = /^([\d.]+)\s*([万wW])$/;

export function normalizeXhsCount(value: XhsMetricValue): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  }

  if (!value) {
    return 0;
  }

  const normalized = String(value)
    .trim()
    .replaceAll(',', '')
    .replace(/[+＋]/g, '');

  const unitMatch = normalized.match(COUNT_UNIT_PATTERN);
  if (unitMatch) {
    const amount = Number.parseFloat(unitMatch[1]);
    return Number.isFinite(amount) ? Math.round(amount * 10_000) : 0;
  }

  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
}

export function uniqueClean(values: string[]) {
  return Array.from(
    new Set(
      values.map((value) => value.trim().replace(/^#/, '')).filter(Boolean),
    ),
  );
}

export function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

export function clampInteger(value: number, min: number, max: number) {
  const integer = Number.isFinite(value) ? Math.round(value) : min;
  return Math.min(max, Math.max(min, integer));
}
