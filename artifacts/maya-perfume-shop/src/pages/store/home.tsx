import { Link } from 'wouter';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { CardSkeletons, ProductCard } from '@/components/store/product-card';
import { CategoryGrid } from '@/components/store/category-icons';
import { useStore } from '@/lib/store-context';

function Lotus() {
  return <svg viewBox="0 0 28 16" aria-hidden="true"><path d="M14 2c2.6 2.6 2.6 8 0 12-2.6-4-2.6-9.4 0-12Z M14 14C11 9 7 7 3 7c1 4 5 7 11 7Zm0 0c3-5 7-7 11-7-1 4-5 7-11 7Z" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/></svg>;
}
function Sprig({ flip }: { flip?: boolean }) {
  return <svg viewBox="0 0 26 16" className={flip ? 'is-flip' : ''} aria-hidden="true"><path d="M2 14C9 13 16 9 22 3M9 12c-1-4 1-7 4-8-.2 4-1.6 6.5-4 8Zm6-4c1-3 4-5 8-4-2 3-4.6 4.3-8 4Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>;
}

export default function Home() {
  const { t, products, loading, isError, refetch } = useStore();
  return <div className="mc-page mc-home mc-ref">
    <img src="/images/reference/floral-edge.webp" alt="" className="mc-ref-edge is-start" aria-hidden="true"/>
    <img src="/images/reference/floral-edge.webp" alt="" className="mc-ref-edge is-end" aria-hidden="true"/>
    <section className="mc-ref-mast">
      <h1 dir="ltr" data-testid="text-brand-title">MAYA COLLECTION</h1>
      <p>{t('brandTagline')}</p>
      <div className="mc-ref-lotus"><span/><Lotus/><span/></div>
    </section>

    <section className="mc-ref-hero" aria-labelledby="banner-title">
      <img src="/images/reference/regal-bottle.webp" alt="MAYA Collection eau de parfum" className="mc-ref-hero-art" dir="ltr"/>
      <div className="mc-ref-hero-copy">
        <span>{t('newArrivals')}</span>
        <h2 id="banner-title">{t('bannerTitle')}</h2>
        <Link href="/collection" className="mc-ref-shop" data-testid="link-shop-now">{t('shopNow')} <ArrowRight size={16} className="mc-flip"/></Link>
      </div>
    </section>

    <section className="mc-ref-sec">
      <h2 className="mc-ref-h2">{t('categories')}</h2>
      <CategoryGrid/>
    </section>

    <section className="mc-ref-sec">
      <div className="mc-ref-storehead"><span/><Sprig/><h2>{t('ourStore')}</h2><Sprig flip/><span/></div>
      {loading ? <div className="mc-ref-grid-wrap"><CardSkeletons/></div> : isError && !products.length ? <div className="mc-state" role="alert"><p>{t('loadError')}</p><button className="mc-ghost-btn" onClick={refetch} data-testid="button-retry-catalog"><RefreshCw size={15}/> {t('retry')}</button></div>
        : products.length ? <div className="mc-grid mc-ref-grid">{products.slice(0, 9).map((p, i) => <ProductCard key={p.id} product={p} index={i}/>)}</div>
        : <div className="mc-state mc-ref-empty" data-testid="status-empty-catalog"><p>{t('noProducts')}</p></div>}
      {products.length > 9 && <div className="mc-more"><Link href="/collection" className="mc-ghost-btn" data-testid="link-more-products">{t('explore')} <ArrowRight size={15} className="mc-flip"/></Link></div>}
    </section>
  </div>;
}
