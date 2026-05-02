import type { ReceiptLineItem, TaxLine } from './types';

const TAX_PATTERN = /^(gst|pst|hst|qst|tax|vat|sales\s*tax|provincial|federal)/i;

export function isTaxLine(description: string): boolean {
  return TAX_PATTERN.test(description.trim());
}

export interface ReceiptTotals {
  selectedSubtotal: number;
  proportionalTaxes: TaxLine[];
  totalTax: number;
  total: number;
}

/**
 * Proportional tax split — same logic as PaintBrain.
 * When user selects a subset of items, taxes are split proportionally
 * based on what fraction of the total product cost they selected.
 */
export function computeReceiptTotals(
  lineItems: ReceiptLineItem[],
  selected: Set<number>
): ReceiptTotals {
  const productItems = lineItems.filter(item => !isTaxLine(item.description));
  const taxItems     = lineItems.filter(item =>  isTaxLine(item.description));

  const allProductSubtotal = productItems.reduce((s, item) => s + item.amount, 0);

  const selectedProducts = productItems.filter((_, pi) => {
    const originalIndex = lineItems.indexOf(productItems[pi]);
    return selected.has(originalIndex);
  });
  const selectedSubtotal = selectedProducts.reduce((s, item) => s + item.amount, 0);

  const proportion = allProductSubtotal > 0 ? selectedSubtotal / allProductSubtotal : 0;

  const proportionalTaxes: TaxLine[] = taxItems.map(tax => ({
    label: tax.description,
    amount: parseFloat((tax.amount * proportion).toFixed(2)),
  }));

  const totalTax = proportionalTaxes.reduce((s, t) => s + t.amount, 0);

  return {
    selectedSubtotal,
    proportionalTaxes,
    totalTax,
    total: parseFloat((selectedSubtotal + totalTax).toFixed(2)),
  };
}

export function fmt(amount: number): string {
  return `$${Math.abs(amount).toFixed(2)}`;
}
