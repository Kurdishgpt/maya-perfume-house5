export type Currency = 'USD' | 'IQD';
export type MoneyTotals = Partial<Record<Currency, number>>;
type Priced = { price: number; currency?: Currency };

export function formatMoney(amount: number, currency: Currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency,
    minimumFractionDigits: currency === 'IQD' ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function totalByCurrency(items: Array<Priced & { quantity: number }>): MoneyTotals {
  return items.reduce<MoneyTotals>((totals, item) => {
    const currency = item.currency ?? 'USD';
    totals[currency] = (totals[currency] ?? 0) + item.price * item.quantity;
    return totals;
  }, {});
}

export function formatTotals(totals: MoneyTotals) {
  const currencies: Currency[] = ['USD', 'IQD'];
  return currencies.filter((currency) => totals[currency] !== undefined)
    .map((currency) => formatMoney(totals[currency]!, currency)).join(' + ') || formatMoney(0);
}

// Unlike currencies cannot be compared without an agreed exchange rate.
export function comparePrices(a: Priced, b: Priced, direction = 1) {
  return (a.currency ?? 'USD').localeCompare(b.currency ?? 'USD')
    || (a.price - b.price) * direction;
}
