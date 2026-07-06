// =============================================================================
// index.ts — public surface of the ontology REST API
// -----------------------------------------------------------------------------
// `apiRoutes` is the flat route table. `createApiRouter()` returns a dispatcher
// whose `handle(method, path, opts)` is directly unit-testable and is also what
// the framework adapters delegate to. `bindExpress(app)` wires the routes onto
// an Express app without the package taking a hard dependency on Express types.
// =============================================================================
import { createRouter, guard, type ApiRouter, type Route } from './http.js';
import { entityRoutes } from './entities.js';
import { relationshipRoutes } from './relationships.js';
import { eventRoutes, evidenceRoutes } from './events.js';
import { riskRoutes, scoreRoutes, actionRoutes } from './risks.js';
import { candidateRoutes, constituencyRoutes } from './candidates.js';
import { fptpRoutes, policyRoutes, factionRoutes, warRoomRoutes } from './fptp.js';
import { temporalApiRoutes } from './temporal/temporal.js';
import { candidateIntelApiRoutes } from './candidate-intelligence/candidate-intelligence.js';
import { relationshipGraphApiRoutes } from './relationship-graph/relationships.js';

export * from './http.js';

export const apiRoutes: Route[] = [
  ...entityRoutes,
  ...relationshipRoutes,
  ...eventRoutes,
  ...evidenceRoutes,
  ...riskRoutes,
  ...scoreRoutes,
  ...actionRoutes,
  ...candidateRoutes,
  ...constituencyRoutes,
  ...fptpRoutes,
  ...policyRoutes,
  ...factionRoutes,
  ...warRoomRoutes,
  ...temporalApiRoutes,
  ...candidateIntelApiRoutes,
  ...relationshipGraphApiRoutes,
];

export function createApiRouter(): ApiRouter {
  return createRouter(apiRoutes);
}

/**
 * Minimal structural type for an Express-like app — avoids a hard dependency on
 * `@types/express`. Any object with the verb methods will satisfy it.
 */
interface ExpressLike {
  get(path: string, handler: (req: any, res: any) => void): unknown;
  post(path: string, handler: (req: any, res: any) => void): unknown;
  patch(path: string, handler: (req: any, res: any) => void): unknown;
  put(path: string, handler: (req: any, res: any) => void): unknown;
  delete(path: string, handler: (req: any, res: any) => void): unknown;
}

/** Wire the ontology routes onto an Express app. Assumes `express.json()` is mounted. */
export function bindExpress(app: ExpressLike): void {
  for (const route of apiRoutes) {
    const verb = route.method.toLowerCase() as 'get' | 'post' | 'patch' | 'put' | 'delete';
    const handler = guard(route.handler);
    app[verb](route.path, async (req: any, res: any) => {
      const result = await handler({
        params: req.params ?? {},
        query: req.query ?? {},
        body: req.body ?? null,
        actor: {
          userId: req.user?.id,
          ipAddress: req.ip,
          userAgent: req.get?.('user-agent'),
        },
      });
      res.status(result.status).json(result.body);
    });
  }
}
