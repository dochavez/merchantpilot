/**
 * Tabular entities exposed to BI tools (OData feed for Power BI / Excel, and CSV downloads).
 * One definition per table: name, key, typed columns and how to get its rows from the report model.
 */
import type { ReportModel } from './report-model';

export type EdmType = 'Edm.String' | 'Edm.Decimal' | 'Edm.Int32' | 'Edm.Date' | 'Edm.DateTimeOffset' | 'Edm.Boolean';
export interface EntityColumn {
  name: string;
  type: EdmType;
  get: (row: any) => unknown;
}
export interface EntityDef {
  name: string;
  description: string;
  key: string;
  columns: EntityColumn[];
  rows: (m: ReportModel) => any[];
}

const s = (name: string, field = name.charAt(0).toLowerCase() + name.slice(1)): EntityColumn => ({ name, type: 'Edm.String', get: (r) => r[field] ?? null });
const d = (name: string, field: string): EntityColumn => ({ name, type: 'Edm.Decimal', get: (r) => (typeof r[field] === 'number' ? r[field] : null) });
const i = (name: string, field: string): EntityColumn => ({ name, type: 'Edm.Int32', get: (r) => (typeof r[field] === 'number' ? Math.round(r[field]) : null) });
const date = (name: string, field: string): EntityColumn => ({ name, type: 'Edm.Date', get: (r) => (r[field] ? String(r[field]).slice(0, 10) : null) });
const ts = (name: string, field: string): EntityColumn => ({ name, type: 'Edm.DateTimeOffset', get: (r) => (r[field] ? new Date(r[field]).toISOString() : null) });

export const ENTITIES: EntityDef[] = [
  {
    name: 'Transactions',
    description: 'Every PayPal transaction (payments, refunds, chargebacks, transfers). Refunds are negative.',
    key: 'TransactionId',
    columns: [
      s('TransactionId', 'transactionId'),
      date('Date', 'date'),
      ts('DateTime', 'datetime'),
      s('Type', 'type'),
      s('Status', 'status'),
      s('EventCode', 'eventCode'),
      s('Product', 'item'),
      s('CustomerName', 'customerName'),
      s('CustomerEmail', 'customerEmail'),
      s('Country', 'country'),
      s('Instrument', 'instrument'),
      d('Gross', 'gross'),
      d('Fee', 'fee'),
      d('Net', 'net'),
      s('Currency', 'currency'),
      s('RelatedTransactionId', 'relatedTransactionId'),
    ],
    rows: (m) => m.dataset.transactions,
  },
  {
    name: 'Disputes',
    description: 'PayPal disputes with deadlines.',
    key: 'DisputeId',
    columns: [
      s('DisputeId', 'disputeId'),
      s('TransactionId', 'transactionId'),
      s('Reason', 'reason'),
      s('Status', 'status'),
      s('Stage', 'stage'),
      d('Amount', 'amount'),
      s('Currency', 'currency'),
      date('CreatedDate', 'createdDate'),
      date('ResponseDueDate', 'responseDueDate'),
      i('DaysToRespond', 'daysToRespond'),
      s('CustomerEmail', 'customerEmail'),
      s('Product', 'item'),
      s('Outcome', 'outcome'),
    ],
    rows: (m) => m.dataset.disputes,
  },
  {
    name: 'Invoices',
    description: 'PayPal invoices and how overdue they are.',
    key: 'InvoiceId',
    columns: [
      s('InvoiceId', 'invoiceId'),
      s('InvoiceNumber', 'invoiceNumber'),
      s('Status', 'status'),
      s('CustomerName', 'recipientName'),
      s('CustomerEmail', 'recipientEmail'),
      d('Amount', 'amount'),
      s('Currency', 'currency'),
      date('InvoiceDate', 'invoiceDate'),
      date('DueDate', 'dueDate'),
      i('DaysOverdue', 'daysOverdue'),
      ts('LastReminderAt', 'lastReminderAt'),
    ],
    rows: (m) => m.dataset.invoices,
  },
  {
    name: 'WeeklyTrend',
    description: 'Sales, refunds and orders per week (last 90 days).',
    key: 'WeekStart',
    columns: [date('WeekStart', 'weekStart'), d('Sales', 'sales'), d('Refunds', 'refunds'), i('Orders', 'orders'), d('RefundRatePct', 'refundRatePct')],
    rows: (m) => m.weekly,
  },
  {
    name: 'Products',
    description: 'Sales and refund rate per product (last 90 days).',
    key: 'Product',
    columns: [s('Product', 'item'), i('Orders', 'orders'), d('Sales', 'sales'), i('RefundCount', 'refundCount'), d('Refunds', 'refunds'), d('RefundRatePct', 'refundRatePct')],
    rows: (m) => m.products,
  },
  {
    name: 'Countries',
    description: 'Sales and open disputes per country (last 90 days).',
    key: 'Country',
    columns: [s('Country', 'country'), i('Orders', 'orders'), d('Sales', 'sales'), i('OpenDisputes', 'openDisputes')],
    rows: (m) => m.countries,
  },
  {
    name: 'Findings',
    description: 'Anomalies and priorities detected by MerchantPilot.',
    key: 'FindingId',
    columns: [s('FindingId', 'id'), s('Severity', 'severity'), s('Title', 'title'), s('Detail', 'detail'), { name: 'SuggestedActions', type: 'Edm.String', get: (r) => r.suggestedActions.join(' | ') }],
    rows: (m) => m.findings,
  },
  {
    name: 'Actions',
    description: 'Audit trail: actions proposed by the AI and the merchant decision.',
    key: 'ActionId',
    columns: [
      s('ActionId', 'id'),
      s('Kind', 'kind'),
      s('Title', 'title'),
      s('Status', 'status'),
      s('Rationale', 'rationale'),
      { name: 'ImpactAmount', type: 'Edm.Decimal', get: (r) => r.impact?.amount ?? null },
      ts('CreatedAt', 'createdAt'),
      ts('DecidedAt', 'decidedAt'),
      s('ExecutedVia', 'executedVia'),
      { name: 'Result', type: 'Edm.String', get: (r) => r.error ?? r.result ?? null },
    ],
    rows: (m) => m.actions,
  },
  {
    name: 'Kpis',
    description: 'Headline KPIs for the selected period (one row).',
    key: 'PeriodDays',
    columns: [
      i('PeriodDays', 'periodDays'),
      d('GrossSales', 'grossSales'),
      d('GrossSalesPrevPeriod', 'grossSalesPrevPeriod'),
      i('Orders', 'orders'),
      d('AverageOrderValue', 'averageOrderValue'),
      d('Refunds', 'refunds'),
      d('RefundRatePct', 'refundRatePct'),
      d('Chargebacks', 'chargebacks'),
      d('PaypalFees', 'paypalFees'),
      d('NetRevenue', 'netRevenue'),
      i('OpenDisputes', 'openDisputes'),
      d('AmountAtRiskInDisputes', 'amountAtRiskInDisputes'),
      i('OverdueInvoices', 'overdueInvoices'),
      d('OverdueInvoiceTotal', 'overdueInvoiceTotal'),
      d('MoneyAtStake', 'moneyAtStake'),
      s('Currency', 'currency'),
    ],
    rows: (m) => [{ ...m.kpis, moneyAtStake: m.moneyAtStake }],
  },
];

export function findEntity(name: string): EntityDef | undefined {
  return ENTITIES.find((e) => e.name.toLowerCase() === name.toLowerCase());
}

export function projectRows(e: EntityDef, m: ReportModel, cols = e.columns): Record<string, unknown>[] {
  return e.rows(m).map((r) => Object.fromEntries(cols.map((c) => [c.name, c.get(r)])));
}

const xml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function edmx(): string {
  const ns = 'MerchantPilot';
  const types = ENTITIES.map(
    (e) =>
      `<EntityType Name="${e.name}"><Key><PropertyRef Name="${e.key}"/></Key>` +
      e.columns.map((c) => `<Property Name="${c.name}" Type="${c.type}"${c.name === e.key ? ' Nullable="false"' : ''}${c.type === 'Edm.Decimal' ? ' Scale="variable"' : ''}/>`).join('') +
      `</EntityType>`,
  ).join('');
  const sets = ENTITIES.map(
    (e) => `<EntitySet Name="${e.name}" EntityType="${ns}.${e.name}"><Annotation Term="Org.OData.Core.V1.Description" String="${xml(e.description)}"/></EntitySet>`,
  ).join('');
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">` +
    `<edmx:DataServices><Schema Namespace="${ns}" xmlns="http://docs.oasis-open.org/odata/ns/edm">` +
    types +
    `<EntityContainer Name="Container">${sets}</EntityContainer>` +
    `</Schema></edmx:DataServices></edmx:Edmx>`
  );
}

export function toCsv(e: EntityDef, m: ReportModel): string {
  const rows = projectRows(e, m);
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const str = String(v);
    return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  return '﻿' + [e.columns.map((c) => c.name).join(','), ...rows.map((r) => e.columns.map((c) => esc(r[c.name])).join(','))].join('\r\n') + '\r\n';
}
