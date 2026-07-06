// =============================================================================
// http.ts — framework-agnostic HTTP layer for the ontology API
// -----------------------------------------------------------------------------
// The ontology is a reusable domain package, so the API layer deliberately does
// NOT bind to Express/Fastify/Next directly. Instead it defines a tiny, typed
// request/response contract and a dispatcher. Adapters (see `adapters.ts`) map a
// real framework onto this contract. This keeps the package dependency-free,
// trivially unit-testable, and portable across REST hosts.
// =============================================================================
import type { ActorContext } from '../domain/ontology/types.js';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** Normalised inbound request. `params` are path params, `query` is the query string. */
export interface ApiRequest {
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  actor: ActorContext;
}

export interface ApiResult<T = unknown> {
  status: number;
  body: T;
}

export type ApiHandler = (req: ApiRequest) => Promise<ApiResult> | ApiResult;

export interface Route {
  method: HttpMethod;
  /** Express-style path, e.g. `/api/entities/:id`. */
  path: string;
  handler: ApiHandler;
}

// ---- result helpers ---------------------------------------------------------
export const ok = <T>(body: T): ApiResult<T> => ({ status: 200, body });
export const created = <T>(body: T): ApiResult<T> => ({ status: 201, body });
export const noContent = (): ApiResult<null> => ({ status: 204, body: null });
export const badRequest = (message: string, details?: unknown): ApiResult =>
  ({ status: 400, body: { error: 'bad_request', message, details } });
export const notFound = (message = 'Not found'): ApiResult =>
  ({ status: 404, body: { error: 'not_found', message } });
export const forbidden = (message = 'Forbidden'): ApiResult =>
  ({ status: 403, body: { error: 'forbidden', message } });
export const serverError = (message: string): ApiResult =>
  ({ status: 500, body: { error: 'server_error', message } });

/** Wrap a handler so a forgotten return becomes 404 and thrown errors become 500. */
export function guard(handler: ApiHandler): ApiHandler {
  return async (req) => {
    try {
      const result = await handler(req);
      // A handler that returns nothing (e.g. forgot to return) is treated as a
      // miss. Any explicit ApiResult — including a 204 with a null body — is
      // respected as-is.
      if (result == null) return notFound();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error';
      // Validation errors are surfaced as 400 by the handlers themselves; any
      // error reaching here is unexpected.
      return serverError(message);
    }
  };
}

// ---- router -----------------------------------------------------------------

interface CompiledRoute {
  method: HttpMethod;
  regex: RegExp;
  keys: string[];
  handler: ApiHandler;
}

function compile(path: string): { regex: RegExp; keys: string[] } {
  const keys: string[] = [];
  const pattern = path
    .replace(/[.*+?^${}()|[\]\\]/g, (m) => (m === ':' ? m : `\\${m}`))
    .replace(/:([A-Za-z0-9_]+)/g, (_full, key: string) => {
      keys.push(key);
      return '([^/]+)';
    });
  return { regex: new RegExp(`^${pattern}$`), keys };
}

export interface ApiRouter {
  routes: Route[];
  handle(
    method: HttpMethod,
    path: string,
    opts?: { query?: Record<string, string | undefined>; body?: unknown; actor?: ActorContext },
  ): Promise<ApiResult>;
}

/**
 * Build a dispatcher from a flat route list. `handle` is what tests call and
 * what framework adapters delegate to. Path is matched without the query string.
 */
export function createRouter(routes: Route[]): ApiRouter {
  const compiled: CompiledRoute[] = routes.map((r) => {
    const { regex, keys } = compile(r.path);
    return { method: r.method, regex, keys, handler: guard(r.handler) };
  });

  return {
    routes,
    async handle(method, path, opts = {}) {
      const pathname = path.split('?')[0];
      for (const route of compiled) {
        if (route.method !== method) continue;
        const match = route.regex.exec(pathname);
        if (!match) continue;
        const params: Record<string, string> = {};
        route.keys.forEach((key, i) => (params[key] = decodeURIComponent(match[i + 1])));
        return route.handler({
          params,
          query: opts.query ?? {},
          body: opts.body ?? null,
          actor: opts.actor ?? {},
        });
      }
      return notFound(`No route for ${method} ${pathname}`);
    },
  };
}

// ---- small parsing helpers shared by handlers ------------------------------
export function intParam(value: string | undefined, fallback: number): number {
  if (value == null) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function boolParam(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}
