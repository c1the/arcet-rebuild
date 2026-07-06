// =============================================================================
// http.test.ts — unit tests for the API router (no DB, no Prisma client).
// http.ts imports only a type from the domain layer, so it is runtime-isolated.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { createRouter, ok, created, badRequest, notFound, intParam, boolParam, type Route } from '../src/api/http.js';

const routes: Route[] = [
  { method: 'GET', path: '/api/entities/search', handler: (req) => ok({ matched: 'search', q: req.query.query }) },
  { method: 'GET', path: '/api/entities/:id', handler: (req) => ok({ id: req.params.id }) },
  { method: 'POST', path: '/api/entities', handler: (req) => created(req.body) },
  { method: 'GET', path: '/api/boom', handler: () => { throw new Error('kaboom'); } },
  { method: 'GET', path: '/api/maybe', handler: () => null as never },
  { method: 'GET', path: '/api/empty', handler: () => ({ status: 204, body: null }) },
];

describe('createRouter', () => {
  const router = createRouter(routes);

  it('matches a static route', async () => {
    const res = await router.handle('GET', '/api/entities/search', { query: { query: 'smith' } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ matched: 'search', q: 'smith' });
  });

  it('prefers the earlier-registered static route over the param route', async () => {
    // /search is registered before /:id, so it should win for "search"
    const res = await router.handle('GET', '/api/entities/search');
    expect((res.body as { matched: string }).matched).toBe('search');
  });

  it('extracts path params', async () => {
    const res = await router.handle('GET', '/api/entities/abc-123');
    expect(res.body).toEqual({ id: 'abc-123' });
  });

  it('decodes encoded path params', async () => {
    const res = await router.handle('GET', '/api/entities/a%2Fb');
    expect(res.body).toEqual({ id: 'a/b' });
  });

  it('passes the request body through on POST', async () => {
    const res = await router.handle('POST', '/api/entities', { body: { displayName: 'X' } });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ displayName: 'X' });
  });

  it('returns 404 for an unknown route', async () => {
    const res = await router.handle('GET', '/api/nope');
    expect(res.status).toBe(404);
  });

  it('ignores the query string when matching the path', async () => {
    const res = await router.handle('GET', '/api/entities/xyz?foo=bar');
    expect(res.body).toEqual({ id: 'xyz' });
  });

  it('converts thrown errors into a 500', async () => {
    const res = await router.handle('GET', '/api/boom');
    expect(res.status).toBe(500);
  });

  it('turns a forgotten return (null) into a 404 via guard', async () => {
    const res = await router.handle('GET', '/api/maybe');
    expect(res.status).toBe(404);
  });

  it('respects an explicit 204 with an empty body', async () => {
    const res = await router.handle('GET', '/api/empty');
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
  });
});

describe('result + parse helpers', () => {
  it('badRequest carries details', () => {
    const r = badRequest('bad', { field: 'x' });
    expect(r.status).toBe(400);
    expect((r.body as { details: unknown }).details).toEqual({ field: 'x' });
  });
  it('notFound has the right shape', () => {
    expect(notFound().status).toBe(404);
  });
  it('intParam parses and falls back', () => {
    expect(intParam('5', 1)).toBe(5);
    expect(intParam(undefined, 7)).toBe(7);
    expect(intParam('not-a-number', 3)).toBe(3);
  });
  it('boolParam recognises true/1', () => {
    expect(boolParam('true')).toBe(true);
    expect(boolParam('1')).toBe(true);
    expect(boolParam('false')).toBe(false);
    expect(boolParam(undefined)).toBe(false);
  });
});
