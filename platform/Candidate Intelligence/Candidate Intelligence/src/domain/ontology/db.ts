// =============================================================================
// db.ts — Prisma client singleton + shared helpers
// =============================================================================
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function makeClient(): PrismaClient {
  const client =
    globalForPrisma.prisma ??
    new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = client;
  return client;
}

// Lazy proxy: the real PrismaClient is constructed on first property access, not
// at import time. This lets pure modules (rules, validators, helpers) and their
// tests be imported in environments where `prisma generate` has not yet run,
// without throwing the "client not initialised" error until the DB is actually
// touched.
let _client: PrismaClient | undefined;
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    _client ??= makeClient();
    const value = (_client as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(_client) : value;
  },
});

/** A Prisma transaction client (subset of PrismaClient used inside $transaction). */
export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

let slugCounter = 0;
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
  // suffix keeps slugs unique without a DB round-trip; callers may collision-check
  const suffix = (Date.now().toString(36) + (slugCounter++).toString(36)).slice(-6);
  return base ? `${base}-${suffix}` : `entity-${suffix}`;
}

/** Map an ordinal enum to a 0..100 scale for blended scoring. */
export function ordinalToScore(value: string, order: readonly string[]): number {
  const idx = order.indexOf(value);
  if (idx < 0) return 0;
  if (order.length === 1) return 100;
  return Math.round((idx / (order.length - 1)) * 100);
}

/** Clamp to a numeric range. */
export function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

/** Average a list of possibly-null scores, ignoring nulls. Returns fallback if empty. */
export function avg(values: (number | null | undefined)[], fallback = 0): number {
  const xs = values.filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
  if (xs.length === 0) return fallback;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Weighted average over {value, weight} pairs, ignoring null values. */
export function weightedAvg(pairs: { value: number | null | undefined; weight: number }[], fallback = 0): number {
  let num = 0;
  let den = 0;
  for (const { value, weight } of pairs) {
    if (typeof value === 'number' && !Number.isNaN(value)) {
      num += value * weight;
      den += weight;
    }
  }
  return den === 0 ? fallback : num / den;
}
