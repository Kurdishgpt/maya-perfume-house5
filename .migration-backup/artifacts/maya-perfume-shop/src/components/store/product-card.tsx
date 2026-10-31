import { Link } from 'wouter';
import { Heart } from 'lucide-react';
import { type StoreProduct } from '@/lib/store';
import { formatMoney } from '@/lib/money';
import { useStore } from '@/lib/store-context';

export function ProductCard({ product, index = 0 }: { product: StoreProduct; index?: number }) {
  const { t, wishlist, toggleWish } = useStore();
  const saved = wishlist.includes(product.id);
  const categoryLabel = product.category && /(unisex|perfect|shared|everyone)/i.test(product.category)
    ? t('unisex') : product.category;
  return <article className="mc-card" style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }} data-testid={`card-product-${product.id}`}>
    <Link href={`/product/${product.id}`} className="mc-card-photo" data-testid={`link-product-${product.id}`}>
      <img src={product.image_url || '/images/hero-fragrance.png'} alt={product.title} loading="lazy" decoding="async"/>
      {product.bottle_size_ml && <span className="mc-card-flag" style={{ top: 'auto', bottom: 8 }} data-testid={`text-size-${product.id}`}>{product.bottle_size_ml} ml</span>}
      {product.stock <= 0 && <span className="mc-card-flag">{t('soldOut')}</span>}
    </Link>
    <div className="mc-card-body">
      <Link href={`/product/${product.id}`} className="mc-card-title"><h3>{product.title}</h3></Link>
      <p className="mc-card-meta">{categoryLabel || product.brand}</p>
      <div className="mc-card-row">
        <strong dir="ltr" data-testid={`text-price-${product.id}`}>{formatMoney(product.price, product.currency)}</strong>
        <button onClick={() => toggleWish(product.id)} className={`mc-heart ${saved ? 'is-saved' : ''}`} aria-pressed={saved} aria-label={`${t('wishlist')}: ${product.title}`} data-testid={`button-wishlist-${product.id}`}><Heart/></button>
      </div>
    </div>
  </article>;
}

export function CardSkeletons({ n = 6 }: { n?: number }) {
  return <div className="mc-grid" aria-busy="true">{Array.from({ length: n }, (_, i) => <div className="mc-card-skeleton" key={i}><span/><i/><i/></div>)}</div>;
}
