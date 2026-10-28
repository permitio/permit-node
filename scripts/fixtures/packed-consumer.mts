import { ApiContext, Permit, type IPermitApi, type PermitApiError } from 'permitio';
import cjs = require('permitio');

const fromCommonjs: ApiContext = new cjs.ApiContext();
const fromEsm: cjs.ApiContext = new ApiContext();
new Permit({ token: 'typecheck-only', apiContext: fromCommonjs });
new cjs.Permit({ token: 'typecheck-only', apiContext: fromEsm });
// @ts-expect-error A constructor requires a complete context.
new Permit({ token: 'typecheck-only', apiContext: {} });

declare const api: IPermitApi;
async function results() {
  const paged = await api.resources.list({ includeTotalCount: true });
  const all = await api.resources.list();
  const mode: boolean = Math.random() > 0.5;
  const dynamic = await api.resources.list({ includeTotalCount: mode });
  const count: number = paged.total_count;
  const key: string = all[0]?.key ?? 'empty';
  // @ts-expect-error All-page mode returns the records, without a page envelope.
  void all.total_count;
  // @ts-expect-error Dynamic pagination requires narrowing before using a page envelope.
  void dynamic.total_count;
  const synced = await api.users.sync({ key: 'customer' });
  const created: boolean = synced.created;
  const userKey: string = synced.user.key;
  // @ts-expect-error Sync returns a user/result envelope rather than the old raw record.
  void synced.key;
  return { count, key, created, userKey };
}

declare const error: PermitApiError;
const status: number | undefined = error.status;
void [results, status];
