import { useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { Check, FlaskConical, MessageCircle, Pencil } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { useCreateStoreOrder, useListRawMaterials, type OrderCheckoutConfirmation } from '@workspace/api-client-react';
import { PageBar } from '@/components/store/header';
import { whatsappNumber } from '@/lib/store';
import { formatMoney, formatTotals } from '@/lib/money';
import { useStore } from '@/lib/store-context';
import { BagSummary } from '@/pages/store/bag';
import { EmptyState } from '@/pages/store/wishlist';

type Details = { name: string; phone: string; city: string; address: string; notes: string };
type Step = 'details' | 'review' | 'done';

export default function Checkout() {
  const { t, cart, rawMaterialCart, subtotal, clearCart } = useStore();
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>('details');
  const [d, setD] = useState<Details>(() => { try { return { name: '', phone: '', city: '', address: '', notes: '', ...JSON.parse(localStorage.getItem('maya-checkout') || '{}') }; } catch { return { name: '', phone: '', city: '', address: '', notes: '' }; } });
  const [errors, setErrors] = useState<Partial<Record<keyof Details, string>>>({});
  const [link, setLink] = useState('');
  const [orderError, setOrderError] = useState('');
  const [orderConfirmation, setOrderConfirmation] = useState<OrderCheckoutConfirmation | null>(null);
  const [sending, setSending] = useState(false);
  const createOrder = useCreateStoreOrder();
  const rawMaterialsQuery = useListRawMaterials();

  const set = (k: keyof Details, v: string) => { setD((o) => ({ ...o, [k]: v })); if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined })); };
  const validate = (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    (['name', 'phone', 'city', 'address'] as const).forEach((k) => { if (!d[k].trim()) next[k] = t('required'); });
    if (d.phone.trim() && d.phone.replace(/\D/g, '').length < 7) next.phone = t('invalidPhone');
    setErrors(next);
    if (Object.keys(next).length) return;
    localStorage.setItem('maya-checkout', JSON.stringify({ name: d.name, phone: d.phone, city: d.city, address: d.address }));
    setStep('review'); window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const send = async () => {
    if (sending) return;
    setOrderError('');
    const items: { product_id: string; quantity: number }[] = [];
    for (const line of cart) {
      if (!line.product.supabase_id) {
        setOrderError('This fragrance is not linked to the live catalog yet. Refresh the shop and try again.');
        return;
      }
      items.push({ product_id: line.product.supabase_id, quantity: line.quantity });
    }
    const rawCatalog = rawMaterialsQuery.data ?? [];
    for (const line of rawMaterialCart) {
      const productId = line.supabase_id || rawCatalog.find((item) => item.source_id === line.source_id)?.supabase_id;
      if (!productId) {
        setOrderError('This raw material is not linked to the live catalog yet. Refresh the raw-material page and try again.');
        return;
      }
      items.push({ product_id: productId, quantity: line.quantity });
    }

    setSending(true);
    const popup = window.open('about:blank', '_blank');
    try {
      const confirmed = await createOrder.mutateAsync({
        data: {
          customer_name: d.name,
          phone: d.phone,
          shipping_address: d.address,
          city: d.city,
          notes: d.notes,
          payment_method: 'whatsapp',
          items,
        },
      });
      const rows = confirmed.items.map((item) =>
        `- ${item.product_name} x ${item.quantity} = ${formatMoney(item.line_total, confirmed.currency)}`,
      ).join('\n');
      const message = `${t('order')} #${confirmed.order_id.slice(0, 8)}\n\n${rows}\n\n${t('subtotal')}: ${formatMoney(confirmed.subtotal, confirmed.currency)}\n${t('delivery')}: ${formatMoney(confirmed.shipping_fee, confirmed.currency)}\n${t('total')}: ${formatMoney(confirmed.total, confirmed.currency)}\n${t('payment')}: ${t('payWhatsapp')}\n\n${t('customer')}: ${d.name}\n${t('phone')}: ${d.phone}\n${t('city')}: ${d.city}\n${t('deliveryAddr')}: ${d.address}${d.notes.trim() ? `\n${t('notesField')}: ${d.notes}` : ''}${rawMaterialCart.length ? `\n\n${t('rawAvailability')}` : ''}`;
      const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
      setOrderConfirmation(confirmed);
      setLink(url);
      if (popup) {
        popup.opener = null;
        popup.location.href = url;
      }
      setStep('done');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      popup?.close();
      setOrderError(error instanceof Error ? error.message : 'The order could not be confirmed. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (step === 'done') return <div className="mc-page">
    <section className="mc-confirm" data-testid="state-order-ready">
      <span className="mc-confirm-ring"><Check/></span>
      <h1>{t('confirmTitle')}</h1>
      <p>{t('confirmBody')}</p>
      {orderConfirmation && <p className="mc-fine is-center">Order #{orderConfirmation.order_id.slice(0, 8)} · {formatMoney(orderConfirmation.total, orderConfirmation.currency)} · pending Maya’s confirmation.</p>}
      <a href={link} target="_blank" rel="noreferrer" className="mc-teal-btn is-block" data-testid="link-reopen-whatsapp"><FaWhatsapp/> {t('reopen')}</a>
      <button className="mc-ghost-btn is-block" onClick={() => { clearCart(); navigate('/'); }} data-testid="button-clear-bag">{t('clearBag')}</button>
    </section>
  </div>;

  if (!cart.length && !rawMaterialCart.length) return <div className="mc-page"><PageBar title={t('checkoutTitle')} onBack={() => navigate('/bag')}/><EmptyState icon="bag" text={t('emptyBag')} action={t('browse')}/></div>;

  const steps: Step[] = ['details', 'review', 'done'];
  return <div className="mc-page mc-checkout">
    <PageBar title={t('checkoutTitle')} onBack={() => step === 'review' ? setStep('details') : navigate('/bag')}/>
    <ol className="mc-steps">{steps.map((s, i) => <li key={s} className={s === step ? 'is-active' : steps.indexOf(step) > i ? 'is-done' : ''}><span>{i + 1}</span>{t(s === 'details' ? 'stepDetails' : s === 'review' ? 'stepReview' : 'stepDone')}</li>)}</ol>
    <div className="mc-bag-layout">
      {step === 'details' ? <form className="mc-form" onSubmit={validate} noValidate>
        {(['name', 'phone', 'city'] as const).map((k) => <label key={k} className={errors[k] ? 'has-error' : ''}><span>{t(k)} *</span>
          <input value={d[k]} onChange={(e) => set(k, e.target.value)} type={k === 'phone' ? 'tel' : 'text'} inputMode={k === 'phone' ? 'tel' : undefined} autoComplete={k === 'name' ? 'name' : k === 'phone' ? 'tel' : 'address-level2'} aria-invalid={!!errors[k]} data-testid={`input-checkout-${k}`}/>
          {errors[k] && <small role="alert">{errors[k]}</small>}</label>)}
        <label className={errors.address ? 'has-error' : ''}><span>{t('address')} *</span><textarea value={d.address} onChange={(e) => set('address', e.target.value)} autoComplete="street-address" aria-invalid={!!errors.address} data-testid="input-checkout-address"/>{errors.address && <small role="alert">{errors.address}</small>}</label>
        <label><span>{t('notesField')}</span><textarea value={d.notes} onChange={(e) => set('notes', e.target.value)} data-testid="input-checkout-notes"/></label>
        <fieldset className="mc-pay"><legend>{t('payment')}</legend>
          <label className="mc-pay-option"><input type="radio" name="pay" checked readOnly data-testid="radio-payment-whatsapp"/><span><MessageCircle size={18}/>{t('payWhatsapp')}</span></label>
          <small>{t('payNote')}</small>
        </fieldset>
        <button className="mc-teal-btn is-block" data-testid="button-review-order">{t('reviewOrder')}</button>
      </form> : <section className="mc-review">
        <div className="mc-review-card"><div className="mc-review-head"><h3>{t('customer')}</h3><button onClick={() => setStep('details')} className="mc-text-btn" data-testid="button-edit-details"><Pencil size={14}/> {t('editDetails')}</button></div>
          <dl><dt>{t('name')}</dt><dd>{d.name}</dd><dt>{t('phone')}</dt><dd dir="ltr">{d.phone}</dd><dt>{t('city')}</dt><dd>{d.city}</dd><dt>{t('address')}</dt><dd>{d.address}</dd>{d.notes.trim() && <><dt>{t('notesField')}</dt><dd>{d.notes}</dd></>}<dt>{t('payment')}</dt><dd>{t('payWhatsapp')}</dd></dl></div>
        {orderError && <p role="alert" className="mc-form-error">{orderError}</p>}
        <button className="mc-teal-btn is-block is-whatsapp" onClick={() => void send()} disabled={sending} data-testid="button-whatsapp-order">{sending ? 'Saving order…' : <><FaWhatsapp/> {t('sendWhatsapp')}</>}</button>
        <p className="mc-fine is-center">{t('receiptNote')}</p>
      </section>}
      <aside className="mc-bag-side">
        <div className="mc-review-card"><h3>{t('orderSummary')}</h3>
           <ul className="mc-mini-lines">
             {cart.map((l) => <li key={`${l.product.id}-${l.size}`}><img src={l.product.image_url || '/images/hero-fragrance.png'} alt=""/><span><strong>{l.product.title}</strong><small dir="ltr">{l.size ? `${l.size} ml` : t('sizeUnknown')} x {l.quantity}</small></span><em dir="ltr">{formatMoney(l.product.price * l.quantity, l.product.currency)}</em></li>)}
             {rawMaterialCart.map((line) => <li key={`raw-${line.id}`}>
               {line.image_url ? <img src={line.image_url} alt=""/> : <span className="mc-mini-material-icon"><FlaskConical size={18}/></span>}
               <span><strong>{line.name}</strong><small dir="ltr">{line.quantity} {line.unit === 'g' ? 'g' : 'item(s)'} · estimate</small></span>
               <em dir="ltr">{formatMoney(line.price * line.quantity, line.currency)}</em>
             </li>)}
           </ul>
          <BagSummary compact/>
        </div>
      </aside>
    </div>
  </div>;
}
