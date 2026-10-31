import assert from 'node:assert/strict';
import { test } from 'node:test';
import { comparePrices, formatMoney, formatTotals, totalByCurrency } from '../src/lib/money.ts';

test('USD and IQD display their original amounts without conversion', () => {
  assert.equal(formatMoney(25, 'USD'), '$25.00');
  assert.match(formatMoney(35000, 'IQD'), /IQD.*35,000/);
  assert.equal(formatMoney(25), '$25.00');
  assert.match(formatMoney(1.5, 'IQD'), /1\.5/);
});

test('mixed-currency subtotals never combine unlike amounts', () => {
  const totals = totalByCurrency([
    { price: 25, currency: 'USD', quantity: 2 },
    { price: 35000, currency: 'IQD', quantity: 3 },
    { price: 5000, currency: 'IQD', quantity: 1 },
  ]);
  assert.deepEqual(totals, { USD: 50, IQD: 110000 });
  assert.match(formatTotals(totals), /\$50\.00.*IQD.*110,000/);
});

test('legacy prices retain USD and free items keep their currency', () => {
  assert.deepEqual(totalByCurrency([{ price: 12.5, quantity: 2 }]), { USD: 25 });
  assert.deepEqual(totalByCurrency([{ price: 0, currency: 'IQD', quantity: 1 }]), { IQD: 0 });
  assert.equal(formatTotals({}), '$0.00');
});

test('price sorting orders within each currency, not across currencies', () => {
  const products = [
    { currency: 'IQD', price: 35000 }, { currency: 'USD', price: 30 },
    { currency: 'IQD', price: 10000 }, { currency: 'USD', price: 10 },
  ];
  const low = [...products].sort((a, b) => comparePrices(a, b));
  const high = [...products].sort((a, b) => comparePrices(a, b, -1));
  assert.deepEqual(low.map((p) => p.price), [10000, 35000, 10, 30]);
  assert.deepEqual(high.map((p) => p.price), [35000, 10000, 30, 10]);
});
