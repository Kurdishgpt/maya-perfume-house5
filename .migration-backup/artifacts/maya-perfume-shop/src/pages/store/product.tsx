import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'wouter';
import { Check, Heart, Minus, Plus, ShoppingBag } from 'lucide-react';
import { PageBar } from '@/components/store/header';
import { formatMoney } from '@/lib/money';
import { useStore } from '@/lib/store-context';
import { useBack } from '@/pages/store/use-back';

export default function ProductPage() {
  const { t, products, loading, wishlist, toggleWish, add } = useStore();
  const params = useParams<{ id: string }>();
  const back = useBack('/collection');
  const product = products.find((p) => p.id === Number(params.id));
  const [active, setActive] = useState(0);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!product) return <div className="mc-page"><PageBar title="MAYA COLLECTION" onBack={back}/>
    {loading ? <div className="mc-detail-skeleton"><span/><i/><i/></div> : <div className="mc-state"><p>{t('noProducts')}</p><Link href="/collection" className="mc-ghost-btn">{t('browse')}</Link></div>}</div>;

  const saved = wishlist.includes(product.id);
  const images = [product.image_url, ...(product.gallery_images || [])].filter(Boolean);
  const onAdd = () => { add(product, product.bottle_size_ml ?? null, qty); setAdded(true); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setAdded(false), 2600); };
  const noteRows = [['top', product.top_notes], ['heart', product.heart_notes], ['base', product.base_notes]] as const;

  return <div className="mc-page mc-product">
    <PageBar title="MAYA COLLECTION" onBack={back} right={<button onClick={() => toggleWish(product.id)} className={`mc-round-btn mc-heart ${saved ? 'is-saved' : ''}`} aria-pressed={saved} aria-label={t('wishlist')} data-testid="button-detail-wishlist"><Heart/></button>}/>
    <div className="mc-product-layout">
      <div className="mc-gallery">
        <div className="mc-gallery-main"><img key={active} src={images[active] || '/images/hero-fragrance.png'} alt={product.title}/></div>
        {images.length > 1 && <div className="mc-thumbs">{images.map((src, i) => <button key={src + i} onClick={() => setActive(i)} className={active === i ? 'is-active' : ''} aria-label={`${product.title} ${i + 1}`} data-testid={`button-gallery-${i + 1}`}><img src={src} alt=""/></button>)}</div>}
      </div>
      <div className="mc-info">
        <span className="mc-kicker">{[product.brand, product.category && /(unisex|perfect|shared|everyone)/i.test(product.category) ? t('unisex') : product.category].filter(Boolean).join(' · ')}</span>
        <h2 className="mc-product-title" data-testid="text-product-title">{product.title}</h2>
        <div className="mc-price-row"><strong dir="ltr" data-testid="text-product-price">{formatMoney(product.price, product.currency)}</strong>
          <span className={`mc-stock ${product.stock > 0 ? '' : 'is-out'}`} data-testid="text-product-stock">{product.stock > 0 ? `${t('stock')} · ${product.stock}` : t('soldOut')}</span></div>
        <p className="mc-fine">{t('currencyNote')}</p>
        {product.description && <p className="mc-desc">{product.description}</p>}

        <div className="mc-notes">
          <h3>{t('notes')}</h3>
          {noteRows.map(([k, vals]) => <div key={k} className="mc-note"><span>{t(k)}</span><p>{vals.join(', ') || '-'}</p></div>)}
          {product.ingredients.length > 0 && <div className="mc-note"><span>{t('ingredientsTitle')}</span><p>{product.ingredients.join(', ')}</p></div>}
        </div>

        <h3 className="mc-label">{t('volume')}</h3>
        <div className="mc-sizes" data-testid="text-product-size"><span dir="ltr">{product.bottle_size_ml ? `${product.bottle_size_ml} ml` : t('sizeUnknown')}</span></div>
        <p className="mc-fine">{t('sku')}: {product.sku}</p>

        <div className="mc-buy">
          <div className="mc-qty" aria-label={t('quantity')}>
            <button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="-" data-testid="button-quantity-minus"><Minus size={16}/></button>
            <span data-testid="text-quantity">{qty}</span>
            <button onClick={() => setQty(Math.min(Math.max(1, product.stock), qty + 1))} aria-label="+" data-testid="button-quantity-plus"><Plus size={16}/></button>
          </div>
          <button disabled={product.stock <= 0} onClick={onAdd} className={`mc-teal-btn mc-add ${added ? 'is-added' : ''}`} data-testid="button-add-to-bag">
            {added ? <><Check size={18}/> {t('added')}</> : <><ShoppingBag size={18}/> {t('add')}</>}
          </button>
        </div>
        {added && <Link href="/bag" className="mc-view-bag" data-testid="link-view-bag">{t('viewBag')}</Link>}
      </div>
    </div>
  </div>;
}
