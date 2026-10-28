import { requireOperator, requireSuper, type Admin, type Operator } from './auth'
import { route } from './http'

// Every /api/admin route goes through this, so none can be added without the super-admin check.
export function superRoute<C = unknown>(label: string, fn: (req: Request, admin: Admin, ctx: C) => Promise<Response>) {
  return route<C>(label, async (req, ctx) => fn(req, await requireSuper(req), ctx))
}

// Every /api/operator route goes through this; the Operator passed in carries the venue from the account.
export function operatorRoute<C = unknown>(label: string, fn: (req: Request, op: Operator, ctx: C) => Promise<Response>) {
  return route<C>(label, async (req, ctx) => fn(req, await requireOperator(req), ctx))
}
