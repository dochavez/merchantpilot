/**
 * Power BI / Excel OData feed model, single business or the whole portfolio.
 *  - Every table gets BusinessId + BusinessName columns, so one Power BI report can slice by business.
 *  - Portfolio feed (/api/odata/all/...): rows of every business stacked; keys become BusinessId + key.
 *  - Extra "Businesses" table: one row per business with health score, grade and headline KPIs.
 */
import { currentBusiness, runInBusiness, type Business } from '../business-context';
import { listBusinesses } from '../businesses';
import { snapshot, type BusinessSnapshot } from '../portfolio';
import { ENTITIES, type EntityColumn, type EntityDef, projectRows } from './entities';
import { loadReportModel } from './load';

const bs = (name: string, field: string): EntityColumn => ({ name, type: 'Edm.String', get: (r) => r[field] ?? null });
const bd = (name: string, field: string): EntityColumn => ({ name, type: 'Edm.Decimal', get: (r) => (typeof r[field] === 'number' ? r[field] : null) });
const bi = (name: string, field: string): EntityColumn => ({ name, type: 'Edm.Int32', get: (r) => (typeof r[field] === 'number' ? Math.round(r[field]) : null) });

export const BUSINESS_COLUMNS: EntityColumn[] = [bs('BusinessId', '__bizId'), bs('BusinessName', '__bizName')];

/** One row per business. Rows are built from portfolio snapshots, not from a ReportModel. */
export const BUSINESSES_ENTITY: EntityDef = {
  name: 'Businesses',
  description: 'One row per business: health score (0-100), grade, sales, refund rate, money at stake and 30-day forecast upside.',
  key: 'BusinessId',
  columns: [
    bs('BusinessId', 'id'),
    bs('BusinessName', 'name'),
    bs('Kind', 'kind'),
    bs('DataMode', 'mode'),
    bs('Currency', 'currency'),
    bi('HealthScore', 'healthScore'),
    bs('HealthGrade', 'healthGrade'),
    bs('HealthReasons', 'healthReasons'),
    bd('Sales30d', 'sales'),
    bd('SalesPrev30d', 'salesPrev'),
    bd('SalesChangePct', 'salesChangePct'),
    bi('Orders30d', 'orders'),
    bd('AverageTicket', 'aov'),
    bd('RefundRatePct', 'refundRatePct'),
    bd('NetRevenue30d', 'net'),
    bd('MoneyAtStake', 'moneyAtStake'),
    bd('ForecastUpside30d', 'upside'),
    bi('OpenDisputes', 'openDisputes'),
    bi('OverdueInvoices', 'overdueInvoices'),
    bi('PendingApprovals', 'pendingApprovals'),
    bd('Mrr', 'mrr'),
    bi('ActiveSubscribers', 'activeSubscribers'),
    bd('ChurnRatePct', 'churnRatePct'),
    bs('TopIssue', 'topIssue'),
  ],
  rows: () => [],
};

function businessRow(s: BusinessSnapshot) {
  const k = s.kpis;
  return {
    id: s.id,
    name: s.name,
    kind: s.kind,
    mode: s.mode,
    currency: s.currency,
    healthScore: s.health?.score,
    healthGrade: s.health?.grade ?? null,
    healthReasons: s.health?.reasons.join(' | ') || null,
    sales: k?.grossSales,
    salesPrev: k?.grossSalesPrevPeriod,
    salesChangePct: k && k.grossSalesPrevPeriod ? Math.round((k.grossSales / k.grossSalesPrevPeriod - 1) * 1000) / 10 : undefined,
    orders: k?.orders,
    aov: k?.averageOrderValue,
    refundRatePct: k?.refundRatePct,
    net: k?.netRevenue,
    moneyAtStake: s.moneyAtStake,
    upside: s.forecast30?.upside,
    openDisputes: k?.openDisputes,
    overdueInvoices: k?.overdueInvoices,
    pendingApprovals: s.pendingApprovals,
    mrr: s.recurring?.mrr,
    activeSubscribers: s.recurring?.activeSubscribers,
    churnRatePct: s.recurring?.churnRatePct,
    topIssue: s.topFindings?.[0]?.title ?? s.error ?? null,
  };
}

export interface FeedEntity {
  def: EntityDef;
  columns: EntityColumn[];
  keys: string[];
}

/** Tables of the feed with business columns added. `multi` = portfolio feed (composite keys). */
export function feedEntities(multi: boolean): FeedEntity[] {
  const list: FeedEntity[] = ENTITIES.map((def) => ({ def, columns: [...BUSINESS_COLUMNS, ...def.columns], keys: multi ? ['BusinessId', def.key] : [def.key] }));
  list.push({ def: BUSINESSES_ENTITY, columns: BUSINESSES_ENTITY.columns, keys: ['BusinessId'] });
  return list;
}

export function findFeedEntity(multi: boolean, name: string): FeedEntity | undefined {
  return feedEntities(multi).find((e) => e.def.name.toLowerCase() === name.toLowerCase());
}

async function businessesInScope(multi: boolean): Promise<Business[]> {
  return multi ? listBusinesses({ withCreds: true }) : [currentBusiness()];
}

/** Rows for one table. Errors of one business (e.g. revoked keys) don't break the others. */
export async function feedRows(multi: boolean, fe: FeedEntity, periodDays: number, cols = fe.columns): Promise<Record<string, unknown>[]> {
  const businesses = await businessesInScope(multi);
  if (fe.def === BUSINESSES_ENTITY) {
    const snaps = await Promise.all(businesses.map((b) => runInBusiness(b, () => snapshot(b))));
    return snaps.map((s) => {
      const r = businessRow(s);
      return Object.fromEntries(cols.map((c) => [c.name, c.get(r)]));
    });
  }
  const own = cols.filter((c) => !BUSINESS_COLUMNS.includes(c));
  const parts = await Promise.all(
    businesses.map((b) =>
      runInBusiness(b, async () => {
        try {
          const m = await loadReportModel(periodDays);
          const biz: Record<string, unknown> = {};
          if (cols.includes(BUSINESS_COLUMNS[0])) biz.BusinessId = b.id;
          if (cols.includes(BUSINESS_COLUMNS[1])) biz.BusinessName = m.merchantName || b.name;
          return projectRows(fe.def, m, own).map((r) => ({ ...biz, ...r }));
        } catch {
          return [];
        }
      }),
    ),
  );
  // Keep the requested column order.
  return parts.flat().map((r) => Object.fromEntries(cols.map((c) => [c.name, r[c.name] ?? null])));
}

const xml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function feedEdmx(multi: boolean): string {
  const ns = 'MerchantPilot';
  const list = feedEntities(multi);
  const types = list
    .map(
      (e) =>
        `<EntityType Name="${e.def.name}"><Key>${e.keys.map((k) => `<PropertyRef Name="${k}"/>`).join('')}</Key>` +
        e.columns.map((c) => `<Property Name="${c.name}" Type="${c.type}"${e.keys.includes(c.name) ? ' Nullable="false"' : ''}${c.type === 'Edm.Decimal' ? ' Scale="variable"' : ''}/>`).join('') +
        `</EntityType>`,
    )
    .join('');
  const sets = list.map((e) => `<EntitySet Name="${e.def.name}" EntityType="${ns}.${e.def.name}"><Annotation Term="Org.OData.Core.V1.Description" String="${xml(e.def.description)}"/></EntitySet>`).join('');
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">` +
    `<edmx:DataServices><Schema Namespace="${ns}" xmlns="http://docs.oasis-open.org/odata/ns/edm">` +
    types +
    `<EntityContainer Name="Container">${sets}</EntityContainer>` +
    `</Schema></edmx:DataServices></edmx:Edmx>`
  );
}
