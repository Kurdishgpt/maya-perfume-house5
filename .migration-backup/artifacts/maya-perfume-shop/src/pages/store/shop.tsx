import { useMemo, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
import { PageBar } from '@/components/store/header';
import { CardSkeletons, ProductCard } from '@/components/store/product-card';
import { inCategory, inFamily, type CategoryKey, type FamilyKey } from '@/lib/store';
import { comparePrices } from '@/lib/money';
import { useStore } from '@/lib/store-context';
import { useBack } from '@/pages/store/use-back';

const families: FamilyKey[] = ['all', 'floral', 'woody', 'fruity', 'oriental'];
const catKeys: CategoryKey[] = ['all', 'women', 'men', 'unisex'];

export default function Shop() {
  const { t, products, loading, isError, refetch } = useStore();
  const search = useSearch();
  const [, navigate] = useLocation();
  const back = useBack('/');
  const params = new URLSearchParams(search);
  const rawCat = params.get('cat');
  const cat: CategoryKey = rawCat === 'women' || rawCat === 'men' ? rawCat
    : rawCat === 'unisex' || rawCat === 'perfect' ? 'unisex' : 'all';
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState<FamilyKey>('all');
  const [sheet, setSheet] = useState(false);
  const [sort, setSort] = useState<'featured' | 'low' | 'high'>('featured');
  const [brand, setBrand] = useState('');
  const [inStock, setInStock] = useState(false);
  const brands = useMemo(() => [...new Set(products.map((p) => p.brand).filter(Boolean))].sort(), [products]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = products.filter((p) => inCategory(p, cat) && inFamily(p, family)
      && (!q || `${p.title} ${p.brand} ${p.category} ${p.description} ${p.ingredients.join(' ')}`.toLowerCase().includes(q))
      && (!brand || p.brand === brand) && (!inStock || p.stock > 0));
    if (sort === 'low') list = [...list].sort((a, b) => comparePrices(a, b));
    if (sort === 'high') list = [...list].sort((a, b) => comparePrices(a, b, -1));
    return list;
  }, [products, cat, family, query, brand, inStock, sort]);
  const activeExtras = (sort !== 'featured' ? 1 : 0) + (brand ? 1 : 0) + (inStock ? 1 : 0);
  const clear = () => {
    setQuery(''); setFamily('all'); setSort('featured'); setBrand(''); setInStock(false);
    if (cat !== 'all') navigate('/collection');
  };
  const setCat = (k: CategoryKey) => navigate(k === 'all' ? '/collection' : `/collection?cat=${k === 'perfect' ? 'unisex' : k}`);

  return <div className="mc-page mc-shop">
    <PageBar title={t(`shop_${cat}`)} onBack={back}/>
    <div className="mc-search-row">
      <label className="mc-search"><Search size={18}/><span className="sr-only">{t(`search_${cat}`)}</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t(`search_${cat}`)} type="search" data-testid="input-search"/>
        {query && <button onClick={() => setQuery('')} aria-label={t('clearFilters')} data-testid="button-clear-search"><X size={15}/></button>}
      </label>
      <button className={`mc-filter-btn ${activeExtras ? 'has-active' : ''}`} onClick={() => setSheet(true)} aria-label={t('filters')} data-testid="button-open-filters"><SlidersHorizontal size={19}/>{activeExtras > 0 && <em>{activeExtras}</em>}</button>
    </div>
    <div className="mc-shop-categories" role="tablist" aria-label={t('category')}>
      {catKeys.map((k) => <button key={k} role="tab" aria-selected={cat === k} className={cat === k ? 'is-active' : ''} onClick={() => setCat(k)} data-testid={`chip-cat-${k}`}>{k === 'all' ? t('fam_all') : t(k)}</button>)}
    </div>
    <div className="mc-chips" role="tablist" aria-label={t('filters')}>
      {families.map((f) => <button key={f} role="tab" aria-selected={family === f} className={family === f ? 'is-active' : ''} onClick={() => setFamily(f)} data-testid={`chip-family-${f}`}>{t(`fam_${f}`)}</button>)}
    </div>
    <p className="mc-count" data-testid="text-result-count">{visible.length} {t('results')}</p>
    {loading ? <CardSkeletons/> : isError && !products.length ? <div className="mc-state" role="alert"><p>{t('loadError')}</p><button className="mc-ghost-btn" onClick={refetch}><RefreshCw size={15}/> {t('retry')}</button></div>
      : !products.length ? <div className="mc-state"><p>{t('noProducts')}</p></div>
      : visible.length ? <div className="mc-grid">{visible.map((p, i) => <ProductCard key={p.id} product={p} index={i}/>)}</div>
      : <div className="mc-state"><Search size={26}/><p>{t('noMatch')}</p><button className="mc-ghost-btn" onClick={clear} data-testid="button-clear-filters">{t('clearFilters')}</button></div>}

    {sheet && <div className="mc-sheet-overlay is-bottom" onClick={() => setSheet(false)} role="presentation">
      <div className="mc-filter-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('filters')}>
        <div className="mc-filter-head"><h2>{t('filters')}</h2><button className="mc-round-btn" onClick={() => setSheet(false)} aria-label={t('close')} data-testid="button-close-filters"><X/></button></div>
        <h3>{t('sort')}</h3>
        <div className="mc-chips is-wrap">{(['featured', 'low', 'high'] as const).map((k) => <button key={k} className={sort === k ? 'is-active' : ''} onClick={() => setSort(k)} data-testid={`chip-sort-${k}`}>{t(k === 'featured' ? 'sortFeatured' : k === 'low' ? 'sortLow' : 'sortHigh')}</button>)}</div>
        <h3>{t('brand')}</h3>
        <select className="mc-select" value={brand} onChange={(e) => setBrand(e.target.value)} data-testid="select-brand"><option value="">{t('allBrands')}</option>{brands.map((b) => <option key={b} value={b}>{b}</option>)}</select>
        <label className="mc-switch"><input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} data-testid="toggle-in-stock"/><span/>{t('inStockOnly')}</label>
        <div className="mc-filter-actions"><button className="mc-ghost-btn" onClick={clear} data-testid="button-reset-filters">{t('clearFilters')}</button><button className="mc-teal-btn" onClick={() => setSheet(false)} data-testid="button-apply-filters">{t('apply')} · {visible.length}</button></div>
      </div>
    </div>}
  </div>;
}
