/**
 * The dashboard judges and merchants see first. Field ids are `<sourceId>.<fieldId>`; date grains
 * use `::day | ::week | ::month`. Validated against a running Studio with api.getHealth()
 * while building it (see tests/e2e/agent-flow.mjs for the browser test).
 */
const kpi = (id: string, field: string, title: string, aggregation = 'sum') => ({
  [id]: {
    type: 'value',
    dataMapping: { value: [{ id: field, aggregation }] },
    format: { title: { enabled: true, text: title }, style: { textScaling: { enabled: true } } },
  },
});

export const INITIAL_REPORT = {
  version: '3.0.0',
  selectedPageId: 'overview',
  panels: { edit: { collapsed: true }, filters: { collapsed: true } },
  pages: [
    {
      id: 'overview',
      layout: { columns: 12, rowHeight: 56, widgetPadding: 8, minWidth: 520 },
      widgets: {
        ...kpi('kpi-sales', 'transactions.sales', 'Sales (90d)'),
        ...kpi('kpi-refunds', 'transactions.refunds', 'Refunds (90d)'),
        ...kpi('kpi-disputes', 'disputes.openAmount', 'Open disputes at risk'),
        ...kpi('kpi-overdue', 'invoices.overdueAmount', 'Overdue invoices'),
        'money-at-stake': {
          type: 'money-at-stake',
          dataMapping: {
            values: [
              { id: 'invoices.overdueAmount', aggregation: 'sum' },
              { id: 'disputes.openAmount', aggregation: 'sum' },
            ],
          },
          format: { title: { enabled: true, text: 'Money at stake – recoverable now' } },
        },
        'trend': {
          type: 'line-chart',
          dataMapping: {
            categoryKey: [{ id: 'transactions.date::week' }],
            valueKey: [
              { id: 'transactions.sales', aggregation: 'sum' },
              { id: 'transactions.refunds', aggregation: 'sum' },
            ],
          },
          format: { title: { enabled: true, text: 'Weekly sales vs refunds' } },
        },
        'refunds-by-item': {
          type: 'bar-chart-grouped',
          dataMapping: {
            categoryKey: [{ id: 'transactions.item' }],
            valueKey: [{ id: 'transactions.refunds', aggregation: 'sum' }],
          },
          sort: [{ field: { id: 'transactions.refunds', aggregation: 'sum' }, direction: 'desc' }],
          format: { title: { enabled: true, text: 'Refunds by product' } },
        },
        'disputes-table': {
          type: 'grid',
          dataMapping: {
            cols: [
              { id: 'disputes.disputeId' },
              { id: 'disputes.isOpen' },
              { id: 'disputes.reason' },
              { id: 'disputes.amount' },
              { id: 'disputes.daysToRespond' },
              { id: 'disputes.item' },
            ],
          },
          sort: [{ field: { id: 'disputes.isOpen' }, direction: 'asc' }],
          format: { title: { enabled: true, text: 'Disputes' } },
        },
        'invoices-table': {
          type: 'grid',
          dataMapping: {
            cols: [
              { id: 'invoices.invoiceNumber' },
              { id: 'invoices.customer' },
              { id: 'invoices.status' },
              { id: 'invoices.amount' },
              { id: 'invoices.daysOverdue' },
              { id: 'invoices.reminded' },
            ],
          },
          sort: [{ field: { id: 'invoices.daysOverdue' }, direction: 'desc' }],
          format: { title: { enabled: true, text: 'Invoices' } },
        },
      },
      widgetLayout: {
        'kpi-sales': { xTrack: 0, yTrack: 0, xSpan: 3, ySpan: 2 },
        'kpi-refunds': { xTrack: 3, yTrack: 0, xSpan: 3, ySpan: 2 },
        'kpi-disputes': { xTrack: 6, yTrack: 0, xSpan: 3, ySpan: 2 },
        'kpi-overdue': { xTrack: 9, yTrack: 0, xSpan: 3, ySpan: 2 },
        'money-at-stake': { xTrack: 0, yTrack: 2, xSpan: 12, ySpan: 2 },
        'trend': { xTrack: 0, yTrack: 4, xSpan: 7, ySpan: 5 },
        'refunds-by-item': { xTrack: 7, yTrack: 4, xSpan: 5, ySpan: 5 },
        'disputes-table': { xTrack: 0, yTrack: 9, xSpan: 6, ySpan: 5 },
        'invoices-table': { xTrack: 6, yTrack: 9, xSpan: 6, ySpan: 5 },
      },
    },
  ],
};
