'use client';

/** Grid cell renderer for drillable fields (invoice #, dispute ID, transaction ID, customer). */
import type { CustomCellRendererProps } from 'ag-grid-react';
import { openDetail, type DetailKind } from '../DetailDrawer';

export function makeDrillCell(kind: DetailKind) {
  function DrillCell(props: CustomCellRendererProps) {
    const value = props.valueFormatted ?? props.value;
    if (value === null || value === undefined || value === '') return null;
    return (
      <button
        type="button"
        className="max-w-full truncate text-left text-[#0070E0] underline decoration-dotted underline-offset-2 hover:decoration-solid"
        onClick={(e) => {
          e.stopPropagation();
          openDetail(kind, String(props.value));
        }}
        title={`Open ${kind} details`}
        data-testid={`drill-${kind}`}
      >
        {String(value)}
      </button>
    );
  }
  return DrillCell;
}
