import { Link, useLocation } from 'wouter';
import { ArrowRight, FlaskConical, Minus, Plus, Trash2 } from 'lucide-react';
import { PageBar } from '@/components/store/header';
import { formatMoney, formatTotals } from '@/lib/money';
import { useStore } from '@/lib/store-context';
import { EmptyState } from '@/pages/store/wishlist';
import { useBack } from '@/pages/store/use-back';

export function BagSummary({ compact = false }: { compact?: boolean }) {
  const { t, subtotal } = useStore();
  return <div className={`mc-summary ${compact ? 'is-compact' : ''}`}>
    <div><span>{t('subtotal')}</span><strong dir="ltr" data-testid="text-subtotal">{formatTotals(subtotal)}</strong></div>
    <div><span>{t('delivery')}</span><em>{t('deliveryValue')}</em></div>
    <div className="is-total"><span>{t('totalBefore')}</span><strong dir="ltr" data-testid="text-total">{formatTotals(subtotal)}</strong></div>
    <small>{t('currencyNote')}</small>
  </div>;
}

export default function Bag() {
  const { t, cart, rawMaterialCart, count, changeQty, removeLine, changeRawMaterialQty, removeRawMaterial, cartSyncState } = useStore();
  const back = useBack('/');
  const [, navigate] = useLocation();
  return <div className="mc-page mc-bag">
    <PageBar title={t('yourBag')} onBack={back} right={count ? <span className="mc-pill">{count}</span> : undefined}/>
    {!cart.length && !rawMaterialCart.length ? <EmptyState icon="bag" text={t('emptyBag')} action={t('browse')}/> : <div className="mc-bag-layout">
      <ul className="mc-lines">
        {cart.map(({ product, quantity, size }) => <li key={`${product.id}-${size}`} className="mc-line" data-testid={`line-${product.id}-${size}`}>
          <Link href={`/product/${product.id}`} className="mc-line-img"><img src={product.image_url || '/images/hero-fragrance.png'} alt={product.title}/></Link>
          <div className="mc-line-copy">
            <Link href={`/product/${product.id}`}><strong>{product.title}</strong></Link>
            <span dir="ltr">{size ? `${size} ml` : t('sizeUnknown')} · {formatMoney(product.price, product.currency)}</span>
            <div className="mc-line-actions">
              <div className="mc-qty is-small">
                <button onClick={() => changeQty(product.id, size, -1)} aria-label="-" data-testid={`button-minus-${product.id}-${size}`}><Minus size={14}/></button>
                <span>{quantity}</span>
                <button onClick={() => changeQty(product.id, size, 1)} aria-label="+" data-testid={`button-plus-${product.id}-${size}`}><Plus size={14}/></button>
              </div>
              <button className="mc-remove" onClick={() => removeLine(product.id, size)} aria-label={`${t('remove')} ${product.title}`} data-testid={`button-remove-${product.id}-${size}`}><Trash2 size={16}/></button>
            </div>
          </div>
          <strong className="mc-line-total" dir="ltr">{formatMoney(product.price * quantity, product.currency)}</strong>
        </li>)}
        {rawMaterialCart.map((line) => <li key={`raw-${line.id}`} className="mc-line" data-testid={`line-raw-material-${line.id}`}>
          <div className="mc-line-img">{line.image_url ? <img src={line.image_url} alt={line.name}/> : <FlaskConical size={24}/>}</div>
          <div className="mc-line-copy">
            <strong>{line.name}</strong>
            <span>{line.category}</span>
            <span dir="ltr">{line.quantity} {line.unit === 'g' ? 'g' : 'item(s)'} · {formatMoney(line.price, line.currency)} / {line.unit === 'g' ? 'g' : 'item'}</span>
            <div className="mc-line-actions">
              <div className="mc-qty is-small">
                <button onClick={() => changeRawMaterialQty(line.id, -1)} aria-label={`Decrease ${line.name} quantity`} data-testid={`button-minus-raw-${line.id}`}><Minus size={14}/></button>
                <span>{line.quantity}</span>
                <button onClick={() => changeRawMaterialQty(line.id, 1)} aria-label={`Increase ${line.name} quantity`} data-testid={`button-plus-raw-${line.id}`}><Plus size={14}/></button>
              </div>
              <button className="mc-remove" onClick={() => removeRawMaterial(line.id)} aria-label={`${t('remove')} ${line.name}`} data-testid={`button-remove-raw-${line.id}`}><Trash2 size={16}/></button>
            </div>
          </div>
          <strong className="mc-line-total" dir="ltr">{formatMoney(line.price * line.quantity, line.currency)}</strong>
        </li>)}
      </ul>
      {count > 0 && <p className="mc-fine" role="status" data-testid="status-bag-sync">{cartSyncState === 'saved' ? 'Your bag is saved securely for this guest session.' : cartSyncState === 'syncing' ? 'Saving your bag…' : cartSyncState === 'unavailable' ? 'Your bag remains on this device; secure sync is currently unavailable.' : 'Your bag is saved on this device.'}</p>}
      {!!rawMaterialCart.length && <p className="mc-fine">{t('rawBagNote')}</p>}
      <aside className="mc-bag-side">
        <BagSummary/>
        <button className="mc-teal-btn is-block" onClick={() => navigate('/checkout')} data-testid="button-proceed-checkout">{t('proceed')} <ArrowRight size={17} className="mc-flip"/></button>
        <p className="mc-fine is-center">{t('receiptNote')}</p>
      </aside>
    </div>}
  </div>;
}
