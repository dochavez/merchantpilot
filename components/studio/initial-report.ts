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

const header = (id: string, text: string) => ({
  [id]: {
    type: 'text',
    dataMapping: {},
    format: { title: { enabled: false }, style: { text, typography: { fontSize: 15, fontWeight: 600 }, verticalAlign: 'center', color: '#0F172A' } },
  },
});
const titled = (text: string) => ({ title: { enabled: true, text } });
const LAYOUT = { columns: 12, rowHeight: 56, widgetPadding: 8, minWidth: 520 };

export const INITIAL_REPORT = {
  version: '3.0.0',
  selectedPageId: 'overview',
  panels: { data: { collapsed: true }, edit: { collapsed: true }, filters: { collapsed: true } },
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
        'recurring': {
          type: 'recurring-revenue',
          dataMapping: {},
          format: { title: { enabled: true, text: 'Recurring revenue (PayPal Subscriptions)' } },
        },
        'forecast': {
          type: 'cashflow-forecast',
          dataMapping: {},
          format: { title: { enabled: true, text: 'Cash-flow forecast & what-if' } },
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
        'recurring': { xTrack: 0, yTrack: 4, xSpan: 12, ySpan: 4 },
        'forecast': { xTrack: 0, yTrack: 8, xSpan: 12, ySpan: 6 },
        'trend': { xTrack: 0, yTrack: 14, xSpan: 7, ySpan: 5 },
        'refunds-by-item': { xTrack: 7, yTrack: 14, xSpan: 5, ySpan: 5 },
        'disputes-table': { xTrack: 0, yTrack: 19, xSpan: 6, ySpan: 5 },
        'invoices-table': { xTrack: 6, yTrack: 19, xSpan: 6, ySpan: 5 },
      },
    },
    /* ------------------------------------------------------------ Sales & customers */
    {
      id: 'sales',
      layout: LAYOUT,
      widgets: {
        ...header('sales-title', 'Sales & customers – what sells, where, and who comes back'),
        'sales-date': { type: 'date-filter', dataMapping: { value: [{ id: 'transactions.date' }] }, format: { title: { enabled: false } } },
        'sales-kind': { type: 'button-filter', dataMapping: { value: [{ id: 'transactions.saleType' }] }, format: { title: { enabled: false }, style: { selection: { type: 'multiple' }, dimensions: { minWidth: 96, height: 30 } } } },
        ...kpi('sales-kpi-sales', 'transactions.sales', 'Sales'),
        ...kpi('sales-kpi-orders', 'transactions.orders', 'Orders'),
        ...kpi('sales-kpi-customers', 'transactions.customerEmail', 'Customers', 'countd'),
        ...kpi('sales-kpi-recurring', 'transactions.recurringSales', 'Recurring (subscriptions)'),
        'sales-treemap': {
          type: 'treemap-chart',
          dataMapping: { categoryKey: [{ id: 'transactions.item' }], valueKey: [{ id: 'transactions.sales', aggregation: 'sum' }] },
          format: titled('What sells – sales by product'),
        },
        'sales-sunburst': {
          type: 'sunburst-chart',
          dataMapping: { categoryKey: [{ id: 'transactions.country' }, { id: 'transactions.item' }], valueKey: [{ id: 'transactions.sales', aggregation: 'sum' }] },
          format: titled('Where – sales by country and product'),
        },
        'sales-combo': {
          type: 'combo-chart-grouped-column-line',
          dataMapping: { categoryKey: [{ id: 'transactions.date::week' }], valueKey: [{ id: 'transactions.sales', aggregation: 'sum' }], secondaryValueKey: [{ id: 'transactions.orders', aggregation: 'sum' }] },
          format: titled('Weekly sales and orders'),
        },
        'sales-pay': {
          type: 'donut-chart',
          dataMapping: { categoryKey: [{ id: 'transactions.instrument' }], valueKey: [{ id: 'transactions.sales', aggregation: 'sum' }] },
          format: titled('How customers pay'),
        },
        'sales-weekday': {
          type: 'column-chart-stacked',
          dataMapping: { categoryKey: [{ id: 'transactions.weekday' }], valueKey: [{ id: 'transactions.sales', aggregation: 'sum' }], legendKey: [{ id: 'transactions.customerType' }] },
          sort: [{ field: { id: 'transactions.weekday' }, direction: 'asc' }],
          format: titled('Sales by weekday – new vs returning customers'),
        },
        'sales-pivot': {
          type: 'pivot-grid',
          dataMapping: { rows: [{ id: 'transactions.item' }], columns: [{ id: 'transactions.date::month' }], values: [{ id: 'transactions.sales', aggregation: 'sum' }] },
          format: titled('Product × month (pivot)'),
        },
      },
      widgetLayout: {
        'sales-title': { xTrack: 0, yTrack: 0, xSpan: 12, ySpan: 1 },
        'sales-date': { xTrack: 0, yTrack: 1, xSpan: 4, ySpan: 2 },
        'sales-kind': { xTrack: 4, yTrack: 1, xSpan: 8, ySpan: 2 },
        'sales-kpi-sales': { xTrack: 0, yTrack: 3, xSpan: 3, ySpan: 2 },
        'sales-kpi-orders': { xTrack: 3, yTrack: 3, xSpan: 3, ySpan: 2 },
        'sales-kpi-customers': { xTrack: 6, yTrack: 3, xSpan: 3, ySpan: 2 },
        'sales-kpi-recurring': { xTrack: 9, yTrack: 3, xSpan: 3, ySpan: 2 },
        'sales-treemap': { xTrack: 0, yTrack: 5, xSpan: 6, ySpan: 6 },
        'sales-sunburst': { xTrack: 6, yTrack: 5, xSpan: 6, ySpan: 6 },
        'sales-combo': { xTrack: 0, yTrack: 11, xSpan: 8, ySpan: 5 },
        'sales-pay': { xTrack: 8, yTrack: 11, xSpan: 4, ySpan: 5 },
        'sales-weekday': { xTrack: 0, yTrack: 16, xSpan: 6, ySpan: 5 },
        'sales-pivot': { xTrack: 6, yTrack: 16, xSpan: 6, ySpan: 5 },
      },
    },
    /* ------------------------------------------------------------ Disputes & refunds */
    {
      id: 'risk',
      layout: LAYOUT,
      widgets: {
        ...header('risk-title', 'Disputes & refunds – what is at risk and how much time is left'),
        ...kpi('risk-kpi-open', 'disputes.openAmount', 'Open disputes at risk'),
        ...kpi('risk-kpi-count', 'disputes.disputes', 'Disputes (90d)'),
        ...kpi('risk-kpi-refunds', 'transactions.refunds', 'Refunds (90d)'),
        'risk-gauge': {
          type: 'radial-gauge',
          dataMapping: { value: [{ id: 'disputes.openDaysToRespond', aggregation: 'min' }] },
          format: { ...titled('Most urgent dispute – days left'), style: { scaleLabel: { enabled: true, min: 0, max: 20 } } },
        },
        'risk-reasons': {
          type: 'nightingale-chart',
          dataMapping: { categoryKey: [{ id: 'disputes.reasonLabel' }], valueKey: [{ id: 'disputes.amount', aggregation: 'sum' }] },
          format: titled('Disputed amount by reason'),
        },
        'risk-country': {
          type: 'bar-chart-grouped',
          dataMapping: { categoryKey: [{ id: 'disputes.country' }], valueKey: [{ id: 'disputes.openAmount', aggregation: 'sum' }] },
          sort: [{ field: { id: 'disputes.openAmount', aggregation: 'sum' }, direction: 'desc' }],
          format: titled('Open disputes by buyer country'),
        },
        'risk-refunds': {
          type: 'area-chart-stacked',
          dataMapping: { categoryKey: [{ id: 'transactions.date::week' }], valueKey: [{ id: 'transactions.refunds', aggregation: 'sum' }], legendKey: [{ id: 'transactions.item' }] },
          format: { ...titled('Refunds per week by product – spot the spike'), seriesLimit: { enabled: true, max: 6 } },
        },
        'risk-table': {
          type: 'grid',
          dataMapping: { cols: [{ id: 'disputes.disputeId' }, { id: 'disputes.isOpen' }, { id: 'disputes.reasonLabel' }, { id: 'disputes.amount' }, { id: 'disputes.openDaysToRespond' }, { id: 'disputes.country' }, { id: 'disputes.item' }] },
          sort: [{ field: { id: 'disputes.isOpen' }, direction: 'asc' }],
          format: titled('Disputes – open first'),
        },
      },
      widgetLayout: {
        'risk-title': { xTrack: 0, yTrack: 0, xSpan: 12, ySpan: 1 },
        'risk-kpi-open': { xTrack: 0, yTrack: 1, xSpan: 4, ySpan: 2 },
        'risk-kpi-count': { xTrack: 4, yTrack: 1, xSpan: 4, ySpan: 2 },
        'risk-kpi-refunds': { xTrack: 8, yTrack: 1, xSpan: 4, ySpan: 2 },
        'risk-reasons': { xTrack: 0, yTrack: 3, xSpan: 4, ySpan: 6 },
        'risk-country': { xTrack: 4, yTrack: 3, xSpan: 4, ySpan: 6 },
        'risk-gauge': { xTrack: 8, yTrack: 3, xSpan: 4, ySpan: 6 },
        'risk-refunds': { xTrack: 0, yTrack: 9, xSpan: 12, ySpan: 5 },
        'risk-table': { xTrack: 0, yTrack: 14, xSpan: 12, ySpan: 6 },
      },
    },
    /* ------------------------------------------------------------ Collections */
    {
      id: 'collections',
      layout: LAYOUT,
      widgets: {
        ...header('col-title', 'Collections – who owes you, how late, and for what'),
        ...kpi('col-kpi-overdue', 'invoices.overdueAmount', 'Overdue'),
        ...kpi('col-kpi-invoiced', 'invoices.amount', 'Invoiced (all)'),
        ...kpi('col-kpi-count', 'invoices.invoices', 'Invoices'),
        'col-gauge': {
          type: 'radial-gauge',
          dataMapping: { value: [{ id: 'invoices.overdueDays', aggregation: 'avg' }] },
          format: titled('Average days late (overdue invoices)'),
        },
        'col-aging': {
          type: 'column-chart-grouped',
          dataMapping: { categoryKey: [{ id: 'invoices.aging' }], valueKey: [{ id: 'invoices.amount', aggregation: 'sum' }] },
          sort: [{ field: { id: 'invoices.aging' }, direction: 'asc' }],
          format: titled('Invoice aging (amount)'),
        },
        'col-customers': {
          type: 'bar-chart-grouped',
          dataMapping: { categoryKey: [{ id: 'invoices.customer' }], valueKey: [{ id: 'invoices.overdueAmount', aggregation: 'sum' }] },
          sort: [{ field: { id: 'invoices.overdueAmount', aggregation: 'sum' }, direction: 'desc' }],
          format: titled('Overdue by customer'),
        },
        'col-products': {
          type: 'treemap-chart',
          dataMapping: { categoryKey: [{ id: 'invoiceLines.product' }], valueKey: [{ id: 'invoiceLines.total', aggregation: 'sum' }] },
          format: titled('Wholesale products invoiced'),
        },
        'col-table': {
          type: 'grid',
          dataMapping: { cols: [{ id: 'invoices.invoiceNumber' }, { id: 'invoices.customer' }, { id: 'invoices.aging' }, { id: 'invoices.amount' }, { id: 'invoices.daysOverdue' }, { id: 'invoices.items' }, { id: 'invoices.reminded' }] },
          sort: [{ field: { id: 'invoices.daysOverdue' }, direction: 'desc' }],
          format: titled('Invoices – latest first by lateness'),
        },
      },
      widgetLayout: {
        'col-title': { xTrack: 0, yTrack: 0, xSpan: 12, ySpan: 1 },
        'col-kpi-overdue': { xTrack: 0, yTrack: 1, xSpan: 4, ySpan: 2 },
        'col-kpi-invoiced': { xTrack: 4, yTrack: 1, xSpan: 4, ySpan: 2 },
        'col-kpi-count': { xTrack: 8, yTrack: 1, xSpan: 4, ySpan: 2 },
        'col-aging': { xTrack: 0, yTrack: 3, xSpan: 8, ySpan: 5 },
        'col-gauge': { xTrack: 8, yTrack: 3, xSpan: 4, ySpan: 5 },
        'col-customers': { xTrack: 0, yTrack: 8, xSpan: 6, ySpan: 6 },
        'col-products': { xTrack: 6, yTrack: 8, xSpan: 6, ySpan: 6 },
        'col-table': { xTrack: 0, yTrack: 14, xSpan: 12, ySpan: 6 },
      },
    },
    /* ------------------------------------------------------------ Subscriptions */
    {
      id: 'recurring',
      layout: LAYOUT,
      widgets: {
        ...header('sub-title', 'Subscriptions – recurring revenue, churn and failed renewals'),
        'sub-summary': { type: 'recurring-revenue', dataMapping: {}, format: titled('Recurring revenue (PayPal Subscriptions)') },
        'sub-mrr': {
          type: 'donut-chart',
          dataMapping: { categoryKey: [{ id: 'subscriptions.plan' }], valueKey: [{ id: 'subscriptions.mrr', aggregation: 'sum' }] },
          format: titled('MRR by plan'),
        },
        'sub-status': {
          type: 'column-chart-stacked',
          dataMapping: { categoryKey: [{ id: 'subscriptions.plan' }], valueKey: [{ id: 'subscriptions.subscribers', aggregation: 'sum' }], legendKey: [{ id: 'subscriptions.status' }] },
          format: titled('Subscribers by plan and status'),
        },
        'sub-churn': {
          type: 'column-chart-grouped',
          dataMapping: { categoryKey: [{ id: 'subscriptions.cancelledDate::week' }], valueKey: [{ id: 'subscriptions.churned', aggregation: 'sum' }] },
          format: titled('Cancellations per week'),
        },
        'sub-table': {
          type: 'grid',
          dataMapping: { cols: [{ id: 'subscriptions.subscriptionId' }, { id: 'subscriptions.plan' }, { id: 'subscriptions.status' }, { id: 'subscriptions.subscriber' }, { id: 'subscriptions.mrr' }, { id: 'subscriptions.nextBillingDate' }, { id: 'subscriptions.failedPayments' }] },
          sort: [{ field: { id: 'subscriptions.failedPayments' }, direction: 'desc' }],
          format: titled('Subscribers – failed payments first'),
        },
      },
      widgetLayout: {
        'sub-title': { xTrack: 0, yTrack: 0, xSpan: 12, ySpan: 1 },
        'sub-summary': { xTrack: 0, yTrack: 1, xSpan: 12, ySpan: 4 },
        'sub-mrr': { xTrack: 0, yTrack: 5, xSpan: 4, ySpan: 5 },
        'sub-status': { xTrack: 4, yTrack: 5, xSpan: 4, ySpan: 5 },
        'sub-churn': { xTrack: 8, yTrack: 5, xSpan: 4, ySpan: 5 },
        'sub-table': { xTrack: 0, yTrack: 10, xSpan: 12, ySpan: 6 },
      },
    },
  ],
};
